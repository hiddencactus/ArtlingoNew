import { useState } from "react";
import Topbar from "../components/TopBar";

export default function UploadPage({ activeTab = "Upload", onTabChange = () => {} }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [backendResult, setBackendResult] = useState(null);

  const handleFileChange = (e) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;

    setFile(chosen);
    setBackendResult(null);

    const url = URL.createObjectURL(chosen);
    setPreviewUrl(url);
  };

  const handleSuggestionClick = async () => {
    if (!file) {
      alert("Please choose an image first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file, file.name);

    try {
      const res = await fetch("http://localhost:5000/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setBackendResult(data);
      console.log("Backend result:", data);
    } catch (err) {
      console.error("Error sending image to backend:", err);
      setBackendResult({ error: err.message || "Request failed" });
    }
  };

  return (
    <div className="page min-h-screen flex flex-col">
      <Topbar active={activeTab} onChange={onTabChange} />

      <div className="page-body container flex-1 flex items-stretch">
        <section className="panel flex-1 flex flex-col">
          <header className="panel-head">
            <h2>Upload</h2>
            <p className="text-sm text-[var(--muted)]">
              Upload an image.
            </p>
          </header>

          <div className="flex flex-col gap-4">
            <div className="row gap-8 items-center">
              <label className="pill ghost cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                Choose image...
              </label>

              <button
                type="button"
                className="pill"
                onClick={handleSuggestionClick}
              >
                View suggestion
              </button>

              {file && (
                <span className="text-xs text-[var(--muted)]">
                  Selected: <strong>{file.name}</strong>
                </span>
              )}
            </div>

            <div
              className="rounded-2xl bg-black/40 flex items-center justify-center overflow-hidden"
              style={{ minHeight: 260 }}
            >
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span className="text-[var(--muted)] text-sm">
                  No image selected.
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
