import { useEffect, useState } from "react";
import Topbar from "../components/TopBar";

export default function UploadPage({ activeTab = "Upload", onTabChange = () => {} }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [backendResult, setBackendResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");


  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);

    setFile(chosen);
    setBackendResult(null);
    setErrorMsg("");

    const url = URL.createObjectURL(chosen);
    setPreviewUrl(url);
  };

  const handleSuggestionClick = async () => {
    if (isLoading) return;

    if (!file) {
      alert("Please choose an image first.");
      return;
    }

    setIsLoading(true);
    setBackendResult(null);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file, file.name);

    try {
      const res = await fetch("http://localhost:5000/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        const msg =
          data?.message ||
          data?.error ||
          `Request failed (${res.status})`;
        setErrorMsg(msg);
        setBackendResult(data || { success: false, message: msg });
        console.error("Backend error:", data);
        return;
      }

      setBackendResult(data);
      console.log("Backend result:", data);
    } catch (err) {
      console.error("Error sending image to backend:", err);
      const msg = err?.message || "Request failed";
      setErrorMsg(msg);
      setBackendResult({ success: false, error: msg, message: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const getScore = (key) => {
    const v = backendResult?.metrics?.[key];
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  };

  const overallScore = (() => {
    const n = Number(backendResult?.overall);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));

    const l = getScore("line");
    const v = getScore("value");
    const h = getScore("harmony");
    if ([l, v, h].every((x) => typeof x === "number")) {
      return Math.round((l + v + h) / 3);
    }
    return null;
  })();

  const scoreLabel = (s) => {
    if (s == null) return "";
    if (s >= 85) return "Excellent";
    if (s >= 70) return "Good";
    if (s >= 50) return "Okay";
    return "Needs work";
  };

  const Metric = ({ title, subtitle, score }) => {
    const safe = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;

    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{title}</div>
            {subtitle ? (
              <div className="text-xs text-[var(--muted)] mt-1">{subtitle}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">{safe}/100</div>
            <div className="text-xs text-[var(--muted)]">{scoreLabel(safe)}</div>
          </div>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/80"
            style={{ width: `${safe}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="page min-h-screen flex flex-col">
      <Topbar active={activeTab} onChange={onTabChange} />

      {/* Blocking overlay + loading bar */}
      {isLoading && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-[min(520px,92vw)] rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold">Analyzing your artwork...</div>
            <div className="mt-2 text-sm text-gray-600">
              Please wait — this can take a few seconds.
            </div>

            <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full w-1/3 animate-[progress_1.1s_infinite] rounded-full bg-gray-900" />
            </div>

            <style>
              {`
                @keyframes progress {
                  0% { transform: translateX(-120%); }
                  100% { transform: translateX(360%); }
                }
              `}
            </style>
          </div>
        </div>
      )}

      <div className="page-body container flex-1 flex items-stretch">
        <section className="panel flex-1 flex flex-col">
          <header className="panel-head">
            <h2>Upload</h2>
            <p className="text-sm text-[var(--muted)]">Upload an image.</p>
          </header>

          <div className="flex flex-col gap-4">
            <div className="row gap-8 items-center">
              <label
                className={`pill ghost cursor-pointer ${isLoading ? "opacity-60 pointer-events-none" : ""}`}
                title={isLoading ? "Analyzing..." : "Choose an image"}
              >
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                  disabled={isLoading}
                />
                Choose image...
              </label>

              <button
                type="button"
                className={`pill ${(!file || isLoading) ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={handleSuggestionClick}
                disabled={!file || isLoading}
                title={!file ? "Choose an image first" : isLoading ? "Analyzing..." : "Analyze image"}
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
                <span className="text-[var(--muted)] text-sm">No image selected.</span>
              )}
            </div>

            {/* Error (friendly) */}
            {errorMsg ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
                <div className="font-semibold">Couldn’t analyze that image</div>
                <div className="text-[var(--muted)] mt-1">{errorMsg}</div>
              </div>
            ) : null}

            {/* Results  */}
            {backendResult?.success ? (
              <div className="rounded-2xl border border-white/10 bg-black/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold">Your Results</div>
                    <div className="text-sm text-[var(--muted)] mt-1">
                      Quick feedback — no technical stuff.
                    </div>
                  </div>

                  {overallScore != null ? (
                    <div className="rounded-2xl bg-white/10 px-4 py-3 text-right">
                      <div className="text-xs text-[var(--muted)]">Overall</div>
                      <div className="text-2xl font-bold">{overallScore}</div>
                      <div className="text-xs text-[var(--muted)]">{scoreLabel(overallScore)}</div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Metric
                    title="Line Quality"
                    subtitle="Are your strokes confident and clean?"
                    score={getScore("line") ?? 0}
                  />
                  <Metric
                    title="Values (Light / Dark)"
                    subtitle="Is there good contrast and depth?"
                    score={getScore("value") ?? 0}
                  />
                  <Metric
                    title="Color Harmony"
                    subtitle="Do the colors feel like they belong together?"
                    score={getScore("harmony") ?? 0}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}