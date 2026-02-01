"""
==============================================================================
ANNOTATION STORAGE MODULE
==============================================================================
Handles reading/writing JSON annotation files.
==============================================================================
"""

import os
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client
from postgrest.exceptions import APIError

ANNOTATIONS_DIR = 'data/annotations'

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ANNOTATIONS_TABLE = os.environ.get("SUPABASE_ANNOTATIONS_TABLE", "annotations")
SUPABASE_ANNOTATION_COLUMN = os.environ.get("SUPABASE_ANNOTATION_COLUMN")

_SUPABASE = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    _SUPABASE = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Create annotations directory if it doesn't exist
os.makedirs(ANNOTATIONS_DIR, exist_ok=True)


def using_supabase():
    """Check whether Supabase storage is configured."""
    return _SUPABASE is not None


def _current_timestamp():
    return datetime.now(timezone.utc).isoformat()


def _execute_query(query, context, raise_on_error=False):
    try:
        return query.execute()
    except APIError as exc:
        if raise_on_error:
            raise RuntimeError(f"Supabase {context} failed: {exc}") from exc
        print(f"Warning: Supabase {context} failed: {exc}")
        return None


def get_annotations_file(image_id):
    """
    Get the file path for annotations of an image.
    
    Args:
      image_id (str): Image filename (e.g., "1.jpeg")
    
    Returns:
      str: Full path to JSON file
    """
    if using_supabase():
        return f"supabase:{SUPABASE_ANNOTATIONS_TABLE}"
    filename = f"annotations_{image_id.replace('.', '_')}.json"
    return os.path.join(ANNOTATIONS_DIR, filename)


def _normalize_supabase_annotations(rows):
    annotations = []
    for row in rows or []:
        if SUPABASE_ANNOTATION_COLUMN:
            annotation = row.get(SUPABASE_ANNOTATION_COLUMN)
            if isinstance(annotation, dict):
                normalized = dict(annotation)
                if "image_id" not in normalized:
                    normalized["image_id"] = row.get("image_id")
                if "artist_id" not in normalized:
                    normalized["artist_id"] = row.get("artist_id")
                if "timestamp" not in normalized:
                    normalized["timestamp"] = row.get("updated_at") or row.get("created_at")
                annotations.append(normalized)
                continue
            annotations.append({
                "image_id": row.get("image_id"),
                "artist_id": row.get("artist_id"),
                SUPABASE_ANNOTATION_COLUMN: annotation,
            })
            continue

        annotation = {
            "image_id": row.get("image_id"),
            "artist_id": row.get("artist_id"),
            "clicks": row.get("clicks"),
            "blurred_grid": row.get("blurred_grid"),
            "patches": row.get("patches"),
            "no_issues": bool(row.get("no_issues", False)),
            "issue_scope": row.get("issue_scope") or [],
        }
        timestamp = row.get("updated_at") or row.get("created_at")
        if timestamp:
            annotation["timestamp"] = timestamp
        annotations.append(annotation)
    return annotations


def load_annotations(image_id):
    """
    Load all annotations for an image from JSON file.
    
    Args:
      image_id (str): Image filename
    
    Returns:
      list: List of annotation dicts, or [] if file doesn't exist
    """
    if using_supabase():
        if SUPABASE_ANNOTATION_COLUMN:
            select_columns = f"{SUPABASE_ANNOTATION_COLUMN},image_id,artist_id,created_at,updated_at"
        else:
            select_columns = "image_id,artist_id,clicks,blurred_grid,patches,no_issues,issue_scope,created_at,updated_at"
        res = _execute_query(
            _SUPABASE.table(SUPABASE_ANNOTATIONS_TABLE)
            .select(select_columns)
            .eq("image_id", image_id),
            f"load annotations for {image_id}",
        )
        if res is None:
            return []
        return _normalize_supabase_annotations(res.data)

    filepath = get_annotations_file(image_id)
    
    if not os.path.exists(filepath):
        return []
    
    try:
        with open(filepath, 'r') as f:
            content = f.read().strip()
            # Handle empty files
            if not content:
                return []
            return json.loads(content)
    except json.JSONDecodeError:
        # If file is corrupted, return empty list
        print(f"Warning: Corrupted JSON in {filepath}, returning empty list")
        return []


def load_all_annotations():
    """Load all annotations across images."""
    if using_supabase():
        if SUPABASE_ANNOTATION_COLUMN:
            select_columns = f"{SUPABASE_ANNOTATION_COLUMN},image_id,artist_id,created_at,updated_at"
        else:
            select_columns = "image_id,artist_id,clicks,blurred_grid,patches,no_issues,issue_scope,created_at,updated_at"
        res = _execute_query(
            _SUPABASE.table(SUPABASE_ANNOTATIONS_TABLE)
            .select(select_columns),
            "load all annotations",
        )
        if res is None:
            return []
        return _normalize_supabase_annotations(res.data)

    annotations = []
    if not os.path.exists(ANNOTATIONS_DIR):
        return annotations
    for filename in os.listdir(ANNOTATIONS_DIR):
        if filename.startswith("annotations_") and filename.endswith(".json"):
            image_id = filename.replace('annotations_', '').replace('.json', '').replace('_', '.')
            annotations.extend(load_annotations(image_id))
    return annotations


def delete_annotation(image_id, artist_id):
    """
    Delete a single artist's annotation for an image.

    Args:
      image_id (str): Image filename
      artist_id (str): Artist identifier

    Returns:
      int: Number of deleted annotations
    """
    if using_supabase():
        res = _execute_query(
            _SUPABASE.table(SUPABASE_ANNOTATIONS_TABLE)
            .delete()
            .eq("image_id", image_id)
            .eq("artist_id", artist_id),
            f"delete annotation for {image_id}",
            raise_on_error=True,
        )
        return len(getattr(res, "data", []) or [])

    filepath = get_annotations_file(image_id)
    annotations = load_annotations(image_id)
    if not annotations:
        return 0

    remaining = [a for a in annotations if a.get("artist_id") != artist_id]
    deleted = len(annotations) - len(remaining)
    if deleted == 0:
        return 0

    with open(filepath, 'w') as f:
        json.dump(remaining, f, indent=2)

    return deleted


def save_annotation(image_id, annotation_dict):
    """
    Save a new annotation to Supabase when configured, otherwise to JSON.
    
    Args:
      image_id (str): Image filename
      annotation_dict (dict): The annotation to save
    
    Returns:
      int: Total number of annotations for this image
    """
    if using_supabase():
        artist_id = annotation_dict.get("artist_id") or "anonymous"
        timestamp = annotation_dict.get("timestamp") or _current_timestamp()
        no_issues = bool(annotation_dict.get("no_issues", False))
        issue_scope = annotation_dict.get("issue_scope") or []

        if not isinstance(issue_scope, list):
            issue_scope = []

        if SUPABASE_ANNOTATION_COLUMN:
            row = {
                "image_id": image_id,
                "artist_id": artist_id,
                SUPABASE_ANNOTATION_COLUMN: annotation_dict,
            }
        else:
            row = {
                "image_id": image_id,
                "artist_id": artist_id,
                "clicks": annotation_dict.get("clicks", []),
                "blurred_grid": annotation_dict.get("blurred_grid", []),
                "patches": annotation_dict.get("patches", []),
                "no_issues": no_issues,
                "issue_scope": issue_scope,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        _execute_query(
            _SUPABASE.table(SUPABASE_ANNOTATIONS_TABLE)
            .upsert(row, on_conflict="image_id,artist_id")
            ,
            "save annotation",
            raise_on_error=True,
        )

        count_res = _execute_query(
            _SUPABASE.table(SUPABASE_ANNOTATIONS_TABLE)
            .select("image_id", count="exact")
            .eq("image_id", image_id),
            "count annotations",
            raise_on_error=True,
        )
        count_value = getattr(count_res, "count", None)
        if isinstance(count_value, int):
            return count_value
        return len(getattr(count_res, "data", []) or [])

    filepath = get_annotations_file(image_id)
    
    # Load existing annotations
    annotations = load_annotations(image_id)
    
    # Replace existing annotation from the same artist, else append
    artist_id = annotation_dict.get("artist_id")
    replaced = False
    if artist_id:
        for idx, existing in enumerate(annotations):
            if existing.get("artist_id") == artist_id:
                annotations[idx] = annotation_dict
                replaced = True
                break
    if not replaced:
        annotations.append(annotation_dict)
    
    # Write back to file
    with open(filepath, 'w') as f:
        json.dump(annotations, f, indent=2)
    
    return len(annotations)


def save_training_data(image_id, training_data):
    """
    Save consensus training data for an image.
    
    Args:
      image_id (str): Image filename
      training_data (dict): Consensus data to save
    
    Returns:
      str: Path to training file
    """
    filename = f"training_{image_id.replace('.', '_')}.json"
    filepath = os.path.join(ANNOTATIONS_DIR, filename)
    
    with open(filepath, 'w') as f:
        json.dump(training_data, f, indent=2)
    
    return filepath


def has_training_data(image_id):
    """Check if training data exists for an image."""
    filename = f"training_{image_id.replace('.', '_')}.json"
    filepath = os.path.join(ANNOTATIONS_DIR, filename)
    return os.path.exists(filepath)

