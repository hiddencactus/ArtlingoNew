import { useState } from "react";
import Topbar from "../components/TopBar";
import MetricBar from "../components/MetricBar"; 

export default function UploadPage({ activeTab = "Upload", onTabChange = () => {} }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [backendResult, setBackendResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    setFile(chosen);
    setBackendResult(null);
    const url = URL.createObjectURL(chosen);
    setPreviewUrl(url);
  };

  const handleSuggestionClick = async () => {
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", file, file.name);

    try {
      const res = await fetch("http://localhost:5000/api/analyze", { method: "POST", body: formData });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setBackendResult(data);
    } catch (err) {
      console.error("Error sending image to backend:", err);
      setBackendResult({ error: err.message || "Request failed" });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="page min-h-screen flex flex-col">
      <Topbar active={activeTab} onChange={onTabChange} />

      <div className="page-body container flex-1 flex items-stretch gap-6">
        {/* Left Panel - Upload & Preview */}
        <section className="panel flex-1 flex flex-col">
          <header className="panel-head">
            <h2>Upload</h2>
            <p className="text-sm text-[var(--muted)]">Upload an image for AI analysis.</p>
          </header>

          <div className="flex flex-col gap-4">
            <div className="row gap-8 items-center">
              <label className="pill ghost cursor-pointer">
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
                Choose image...
              </label>
              <button type="button" className="pill" onClick={handleSuggestionClick} disabled={!file || isLoading}>
                {isLoading ? "Analyzing..." : "View suggestion"}
              </button>
              {file && <span className="text-xs text-[var(--muted)]">Selected: <strong>{file.name}</strong></span>}
            </div>

            <div className="rounded-2xl bg-black/40 flex items-center justify-center overflow-hidden relative" style={{ minHeight: 300 }}>
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "300px", objectFit: "contain", opacity: isLoading ? 0.5 : 1 }} />
              ) : (
                <span className="text-[var(--muted)] text-sm">No image selected.</span>
              )}
              {isLoading && <div className="absolute inset-0 flex items-center justify-center"><span className="chip">Processing...</span></div>}
            </div>
             {backendResult?.error && <div className="p-3 bg-red-900/30 text-red-200 rounded-lg text-sm border border-red-800">Error: {backendResult.error}</div>}
          </div>
        </section>

        {/* Right Panel - Results */}
        {backendResult?.metrics && !backendResult.error && (
            <section className="panel flex-1 flex flex-col max-w-md animate-in fade-in slide-in-from-right-4 duration-300">
                <header className="panel-head">
                    <h2>Analysis Results</h2>
                </header>
                <div className="flex flex-col gap-6">
                    {/* Harmony Badge */}
                     {backendResult.feedback?.harmony_type && (
                         <div className="flex justify-between items-center bg-blue-900/20 p-3 rounded-lg border border-blue-900/50">
                             <span className="text-xs text-blue-200">Detected Scheme</span>
                             <span className="text-sm font-bold text-white">{backendResult.feedback.harmony_type}</span>
                         </div>
                     )}

                    {/* Feedback Text */}
                    <div className="p-4 bg-[var(--panel-2)] rounded-xl">
                        <h3 className="text-sm uppercase tracking-wider text-[var(--muted)] mb-2">AI Feedback</h3>
                        <p className="leading-relaxed">{backendResult.feedback.general}</p>
                    </div>

                    {/* Metric Bars */}
                    <div>
                        <h3 className="text-sm uppercase tracking-wider text-[var(--muted)] mb-4">Scores</h3>
                        <div className="flex flex-col gap-4">
                             <MetricBar label="Harmony Fit" value={backendResult.metrics.harmony} />
                             <MetricBar label="Contrast" value={backendResult.metrics.value_grouping} />
                             <MetricBar label="Line Confidence" value={backendResult.metrics.straightness} />
                        </div>
                    </div>
                </div>
            </section>
        )}
      </div>
    </div>
  );
}