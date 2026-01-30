import os
import tempfile
import time
import uuid
import json
from datetime import timedelta, datetime

from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from supabase import create_client
import jwt  # PyJWT

load_dotenv()

# Environment / config
SUPABASE_URL = os.environ.get("SUPABASE_URL")   
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
BUCKET = os.environ.get("SUPABASE_IMAGE_BUCKET", "images")
SIGNED_URL_EXPIRES = int(os.environ.get("SIGNED_URL_EXPIRES", "3600"))  # seconds

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB limit


# --------------------
# Helpers
# --------------------
def generate_storage_path(filename: str):
    return f"{int(time.time())}_{uuid.uuid4().hex}_{filename}"


def decode_jwt_get_uid(token: str):
    """
    Decode Supabase JWT and return 'sub' (user id).
    In production, verify tokens using project's JWT secret or JWKS.
    Here we try to decode without verification if verify keys aren't provided.
    """
    if not token:
        return None
    parts = token.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
    try:
        # Try decode without verification (safe for getting 'sub' only if you trust transport)
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload.get("sub") or payload.get("user_id")
    except Exception:
        return None


def get_request_user_id():
    """
    Prefer Authorization Bearer token (JWT). If not present, fallback to X-User-Id header (for testing).
    """
    auth = request.headers.get("Authorization")
    if auth:
        uid = decode_jwt_get_uid(auth)
        if uid:
            return uid
    # fallback (INSECURE for prod)
    return request.headers.get("X-User-Id")


def json_or_400():
    body = request.get_json(silent=True)
    if body is None:
        return None, (jsonify({"error": "invalid json"}), 400)
    return body, None


# --------------------
# Image endpoints
# --------------------
@app.route("/images", methods=["POST"])
def upload_image():
    """
    Multipart upload: file + optional fields.
    - file: binary form field
    - original_filename, orig_width, orig_height, processor (optional)
    Returns created images row (201) or error.
    """
    if "file" not in request.files:
        return jsonify({"error": "file required"}), 400

    file = request.files["file"]
    filename = secure_filename(file.filename or "upload")
    original_filename = request.form.get("original_filename", filename)
    orig_width = request.form.get("orig_width")
    orig_height = request.form.get("orig_height")
    processor = request.form.get("processor")

    # save to /tmp then upload
    with tempfile.NamedTemporaryFile() as tmp:
        file.save(tmp.name)
        storage_path = generate_storage_path(filename)
        with open(tmp.name, "rb") as f:
            up = supabase.storage.from_(BUCKET).upload(storage_path, f)
        if up.get("error"):
            return jsonify({"error": "storage upload failed", "details": up["error"]}), 500

    # insert DB row; use requester as uploader_id if provided
    uploader_id = get_request_user_id()
    image_row = {
        "storage_path": storage_path,
        "original_filename": original_filename,
        "proc_width": request.form.get("proc_width", 512),
        "proc_height": request.form.get("proc_height", 512),
        "status": "uploaded",
    }
    if orig_width:
        image_row["orig_width"] = int(orig_width)
    if orig_height:
        image_row["orig_height"] = int(orig_height)
    if processor:
        image_row["processor"] = processor
    if uploader_id:
        image_row["uploader_id"] = uploader_id

    db_res = supabase.table("images").insert(image_row).select("*").execute()
    if db_res.error:
        # cleanup storage
        supabase.storage.from_(BUCKET).remove([storage_path])
        return jsonify({"error": "db insert failed", "details": str(db_res.error)}), 500

    created = db_res.data[0]
    return jsonify(created), 201


@app.route("/images", methods=["GET"])
def list_images():
    """
    Optional query params:
      - status
      - uploader_id
      - page (1-based)
      - per_page
      - q (search original_filename)
    """
    args = request.args
    page = int(args.get("page", 1))
    per_page = int(args.get("per_page", 20))
    status = args.get("status")
    uploader_id = args.get("uploader_id")
    q = args.get("q")

    query = supabase.table("images").select("*")
    if status:
        query = query.eq("status", status)
    if uploader_id:
        query = query.eq("uploader_id", uploader_id)
    if q:
        # naive search in original_filename
        query = query.ilike("original_filename", f"%{q}%")

    # pagination
    offset = (page - 1) * per_page
    res = query.range(offset, offset + per_page - 1).execute()
    if res.error:
        return jsonify({"error": "query failed", "details": str(res.error)}), 500

    # get total count (separate query)
    count_res = supabase.table("images").select("id", count="exact").execute()
    total = None
    if not count_res.error and isinstance(count_res.count, int):
        total = count_res.count

    return jsonify({"data": res.data, "page": page, "per_page": per_page, "total": total})


@app.route("/images/<int:image_id>", methods=["GET"])
def get_image_metadata(image_id):
    res = supabase.table("images").select("*").eq("id", image_id).single().execute()
    if res.error:
        return jsonify({"error": "not found", "details": str(res.error)}), 404
    return jsonify(res.data)


@app.route("/images/<int:image_id>/file", methods=["GET"])
def get_image_file_url(image_id):
    typ = request.args.get("type", "original")
    res = supabase.table("images").select("storage_path,processed_path,preview_path").eq("id", image_id).single().execute()
    if res.error:
        return jsonify({"error": "not found", "details": str(res.error)}), 404
    rec = res.data
    path = None
    if typ == "processed" and rec.get("processed_path"):
        path = rec["processed_path"]
    elif typ == "preview" and rec.get("preview_path"):
        path = rec["preview_path"]
    else:
        path = rec.get("storage_path")
    if not path:
        return jsonify({"error": "no path for requested type"}), 404

    signed = supabase.storage.from_(BUCKET).create_signed_url(path, timedelta(seconds=SIGNED_URL_EXPIRES))
    if signed.get("error"):
        return jsonify({"error": "signed url failed", "details": signed["error"]}), 500
    return jsonify({"url": signed.get("signedURL"), "expires_in": SIGNED_URL_EXPIRES})


# --------------------
# Patch endpoints
# --------------------
@app.route("/images/<int:image_id>/patches", methods=["POST"])
def create_patches_for_image(image_id):
    """
    Body: { "patches": [ {row_idx, col_idx, x, y, width, height, model_score, ...}, ... ] }
    Each patch inserted will be linked to image_id.
    """
    body, err = json_or_400()
    if err:
        return err
    patches = body.get("patches")
    if not isinstance(patches, list) or not patches:
        return jsonify({"error": "patches[] required"}), 400

    for p in patches:
        p["image_id"] = image_id
    res = supabase.table("patches").insert(patches).select("*").execute()
    if res.error:
        return jsonify({"error": "insert failed", "details": str(res.error)}), 500
    return jsonify({"inserted": len(res.data), "rows": res.data}), 201


@app.route("/patches", methods=["POST"])
def bulk_create_patches():
    body, err = json_or_400()
    if err:
        return err
    image_id = body.get("image_id")
    patches = body.get("patches")
    if not image_id or not isinstance(patches, list):
        return jsonify({"error": "image_id and patches[] required"}), 400
    for p in patches:
        p["image_id"] = image_id
    res = supabase.table("patches").insert(patches).select("*").execute()
    if res.error:
        return jsonify({"error": "insert failed", "details": str(res.error)}), 500
    return jsonify({"inserted": len(res.data), "rows": res.data}), 201


@app.route("/images/<int:image_id>/patches", methods=["GET"])
def list_patches_for_image(image_id):
    args = request.args
    hit = args.get("hit")
    min_score = args.get("min_score")
    limit = args.get("limit")
    offset = args.get("offset")

    query = supabase.table("patches").select("*").eq("image_id", image_id)
    if hit is not None:
        query = query.eq("hit", hit.lower() in ("1", "true", "t", "yes"))
    if min_score is not None:
        try:
            ms = float(min_score)
            query = query.gte("model_score", ms)
        except ValueError:
            pass
    if limit is not None:
        try:
            l = int(limit)
            query = query.limit(l)
        except ValueError:
            pass
    if offset is not None:
        try:
            o = int(offset)
            query = query.offset(o)
        except ValueError:
            pass

    res = query.execute()
    if res.error:
        return jsonify({"error": "query failed", "details": str(res.error)}), 500
    return jsonify({"data": res.data})


# --------------------
# Patch labels
# --------------------
@app.route("/patches/<int:patch_id>/labels", methods=["POST"])
def create_patch_label(patch_id):
    body, err = json_or_400()
    if err:
        return err
    image_id = body.get("image_id")
    label_type = body.get("label_type")
    label_value = body.get("label_value")
    if not image_id or not label_type or label_value is None:
        return jsonify({"error": "image_id, label_type, label_value required"}), 400

    user_id = get_request_user_id()
    row = {
        "patch_id": patch_id,
        "image_id": image_id,
        "user_id": user_id,
        "label_type": label_type,
        "label_value": json.dumps(label_value) if not isinstance(label_value, dict) else label_value,
    }
    res = supabase.table("patch_labels").insert(row).select("*").execute()
    if res.error:
        return jsonify({"error": "insert failed", "details": str(res.error)}), 500
    return jsonify(res.data[0]), 201


@app.route("/patches/<int:patch_id>/labels", methods=["GET"])
def get_patch_labels(patch_id):
    res = supabase.table("patch_labels").select("*").eq("patch_id", patch_id).execute()
    if res.error:
        return jsonify({"error": "query failed", "details": str(res.error)}), 500
    return jsonify({"data": res.data})


# --------------------
# Datasets
# --------------------
@app.route("/datasets", methods=["POST"])
def create_dataset():
    body, err = json_or_400()
    if err:
        return err
    name = body.get("name")
    description = body.get("description")
    is_public = body.get("is_public", False)
    image_ids = body.get("image_ids", [])
    if not name:
        return jsonify({"error": "name required"}), 400

    user_id = get_request_user_id()
    row = {
        "name": name,
        "description": description,
        "is_public": is_public,
        "created_by": user_id,
    }
    res = supabase.table("datasets").insert(row).select("*").execute()
    if res.error:
        return jsonify({"error": "insert failed", "details": str(res.error)}), 500
    dataset = res.data[0]

    # add images if provided
    if image_ids:
        rows = [{"dataset_id": dataset["id"], "image_id": iid} for iid in image_ids]
        di_res = supabase.table("dataset_images").insert(rows).execute()
        if di_res.error:
            return jsonify({"error": "dataset created but failed to add images", "details": str(di_res.error)}), 500

    return jsonify(dataset), 201


@app.route("/datasets/<int:dataset_id>", methods=["GET"])
def get_dataset(dataset_id):
    res = supabase.table("datasets").select("*").eq("id", dataset_id).single().execute()
    if res.error:
        return jsonify({"error": "not found", "details": str(res.error)}), 404
    return jsonify(res.data)


@app.route("/datasets/<int:dataset_id>/images", methods=["GET"])
def get_dataset_images(dataset_id):
    res = supabase.table("dataset_images").select("image_id").eq("dataset_id", dataset_id).execute()
    if res.error:
        return jsonify({"error": "query failed", "details": str(res.error)}), 500
    image_ids = [r["image_id"] for r in res.data]
    if not image_ids:
        return jsonify({"data": []})
    images_res = supabase.table("images").select("*").in_("id", image_ids).execute()
    if images_res.error:
        return jsonify({"error": "failed to fetch images", "details": str(images_res.error)}), 500
    return jsonify({"dataset": dataset_id, "images": images_res.data})


@app.route("/datasets/<int:dataset_id>/images", methods=["POST"])
def add_image_to_dataset(dataset_id):
    body, err = json_or_400()
    if err:
        return err
    image_id = body.get("image_id")
    included = body.get("included", True)
    if not image_id:
        return jsonify({"error": "image_id required"}), 400
    row = {"dataset_id": dataset_id, "image_id": image_id, "included": included}
    # upsert
    res = supabase.table("dataset_images").upsert(row, on_conflict="dataset_id,image_id").select("*").execute()
    if res.error:
        return jsonify({"error": "upsert failed", "details": str(res.error)}), 500
    return jsonify(res.data[0]), 200


# --------------------
# Trainings
# --------------------
@app.route("/trainings", methods=["POST"])
def create_training():
    body, err = json_or_400()
    if err:
        return err
    dataset_id = body.get("dataset_id")
    model_type = body.get("model_type", "default")
    params = body.get("params", {})
    if not dataset_id:
        return jsonify({"error": "dataset_id required"}), 400
    user_id = get_request_user_id()
    row = {
        "dataset_id": dataset_id,
        "model_type": model_type,
        "params": params,
        "created_by": user_id,
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),
    }
    res = supabase.table("trainings").insert(row).select("*").execute()
    if res.error:
        return jsonify({"error": "create failed", "details": str(res.error)}), 500

    training = res.data[0]
    # In production: kick an external worker or use EdgeRuntime.waitUntil to run training
    return jsonify(training), 201


@app.route("/trainings/<int:training_id>", methods=["GET"])
def get_training(training_id):
    res = supabase.table("trainings").select("*").eq("id", training_id).single().execute()
    if res.error:
        return jsonify({"error": "not found", "details": str(res.error)}), 404
    return jsonify(res.data)


# --------------------
# Locks
# --------------------
@app.route("/locks", methods=["POST"])
def create_lock():
    """
    Body: { resource_type, resource_id, expires_in_seconds (optional) }
    """
    body, err = json_or_400()
    if err:
        return err
    resource_type = body.get("resource_type")
    resource_id = body.get("resource_id")
    expires_in_seconds = int(body.get("expires_in_seconds", 300))
    if not resource_type or resource_id is None:
        return jsonify({"error": "resource_type and resource_id required"}), 400
    user_id = get_request_user_id()
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=expires_in_seconds)
    # simple insert unless an active lock exists
    # check existing
    existing = supabase.table("locks").select("*").eq("resource_type", resource_type).eq("resource_id", resource_id).gte("expires_at", now.isoformat()).execute()
    if existing.error:
        return jsonify({"error": "lock check failed", "details": str(existing.error)}), 500
    if existing.data:
        return jsonify({"error": "resource locked", "lock": existing.data[0]}), 409
    row = {
        "resource_type": resource_type,
        "resource_id": resource_id,
        "owner": user_id,
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
    }
    res = supabase.table("locks").insert(row).select("*").execute()
    if res.error:
        return jsonify({"error": "create lock failed", "details": str(res.error)}), 500
    return jsonify(res.data[0]), 201


@app.route("/locks/<int:lock_id>", methods=["DELETE"])
def release_lock(lock_id):
    user_id = get_request_user_id()
    # Only owner or service_role should delete; we'll check owner
    lock = supabase.table("locks").select("*").eq("id", lock_id).single().execute()
    if lock.error:
        return jsonify({"error": "not found", "details": str(lock.error)}), 404
    if lock.data.get("owner") and user_id and lock.data.get("owner") != user_id:
        return jsonify({"error": "forbidden"}), 403
    res = supabase.table("locks").delete().eq("id", lock_id).execute()
    if res.error:
        return jsonify({"error": "delete failed", "details": str(res.error)}), 500
    return "", 204


# --------------------
# Misc
# --------------------
@app.route("/art_styles", methods=["GET"])
def art_styles():
    # placeholder: read from art_styles table if exists
    res = supabase.table("art_styles").select("*").execute()
    if res.error:
        return jsonify({"data": []})
    return jsonify({"data": res.data})


@app.route("/images/<int:image_id>/quality_scores", methods=["GET"])
def image_quality_scores(image_id):
    # placeholder: read from image_quality_scores table if exists
    res = supabase.table("image_quality_scores").select("*").eq("image_id", image_id).execute()
    if res.error:
        return jsonify({"error": "query failed", "details": str(res.error)}), 500
    return jsonify({"data": res.data})


# --------------------
# Run
# --------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)