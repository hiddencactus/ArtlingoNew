import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Topbar from "../components/TopBar";

const GRID_SIZE = 16;
const MAJOR_ISSUE_MIN_SCORE = 0.5;
const MAJOR_ISSUE_PERCENTILE = 0.7;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
};

const issueColor = (t) => {
  const x = clamp(t, 0, 1);
  const hue = 52 - 52 * x; // yellow -> red
  return `hsl(${hue}, 95%, ${60 - x * 14}%)`;
};

export default function UploadPage({ activeTab = "Upload", onTabChange = () => {} }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [backendResult, setBackendResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [overlayOpacity, setOverlayOpacity] = useState(0.45);
  const [overlayMode, setOverlayMode] = useState("overlay");
  const [hoverTile, setHoverTile] = useState(null);

  const overlayWrapRef = useRef(null);
  const overlayCanvasRef = useRef(null);


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

  const heatmap16x16 = useMemo(() => {
    if (Array.isArray(backendResult?.heatmap16x16)) return backendResult.heatmap16x16;
    if (Array.isArray(backendResult?.heatmaps?.issue)) return backendResult.heatmaps.issue;
    return null;
  }, [backendResult]);

  const heatmapMeta = useMemo(() => {
    if (backendResult?.meta) return backendResult.meta;
    const preprocess = backendResult?.debug?.preprocess;
    if (!preprocess) return null;
    return {
      target_size: Number(preprocess.target_size),
      resized_width: Number(preprocess.resized_width),
      resized_height: Number(preprocess.resized_height),
      pad_left: Number(preprocess.pad_left),
      pad_top: Number(preprocess.pad_top),
    };
  }, [backendResult]);

  const majorIssueStats = useMemo(() => {
    if (!heatmap16x16) return null;

    const rawScores = heatmap16x16.flat().map((v) => clamp(Number(v) || 0, 0, 1));
    if (!rawScores.length) return null;

    const pCutoff = percentile(rawScores, MAJOR_ISSUE_PERCENTILE);
    const cutoff = clamp(Math.max(MAJOR_ISSUE_MIN_SCORE, pCutoff), 0, 1);
    const shown = rawScores.filter((s) => s >= cutoff).length;

    return {
      cutoff,
      shown,
      total: rawScores.length,
    };
  }, [heatmap16x16]);

  const topTiles = useMemo(() => {
    if (!heatmap16x16 || !majorIssueStats) return [];

    const flattened = [];
    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        const score = clamp(Number(heatmap16x16[r]?.[c]) || 0, 0, 1);
        if (score < majorIssueStats.cutoff) continue;
        flattened.push({ row: r, col: c, score });
      }
    }

    return flattened.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [heatmap16x16, majorIssueStats]);

  const resolvedImageUrl = useMemo(() => {
    const imageUrl = backendResult?.imageUrl;
    if (!imageUrl) return null;
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
    return `http://localhost:5000${imageUrl}`;
  }, [backendResult]);

  const displayImageUrl = resolvedImageUrl || previewUrl;

  const drawHeatmap = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const wrapper = overlayWrapRef.current;
    if (!canvas || !wrapper) return;

    const cssWidth = wrapper.clientWidth;
    const cssHeight = wrapper.clientHeight;
    if (!cssWidth || !cssHeight) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (!heatmap16x16 || !heatmapMeta || !majorIssueStats) return;

    const targetSize = Math.max(1, Number(heatmapMeta.target_size) || 1024);
    const padLeft = clamp(Number(heatmapMeta.pad_left) || 0, 0, targetSize);
    const padTop = clamp(Number(heatmapMeta.pad_top) || 0, 0, targetSize);
    const resizedWidth = clamp(Number(heatmapMeta.resized_width) || targetSize, 0, targetSize);
    const resizedHeight = clamp(Number(heatmapMeta.resized_height) || targetSize, 0, targetSize);

    const contentLeft = padLeft;
    const contentTop = padTop;
    const contentRight = clamp(padLeft + resizedWidth, 0, targetSize);
    const contentBottom = clamp(padTop + resizedHeight, 0, targetSize);

    const scaleX = cssWidth / targetSize;
    const scaleY = cssHeight / targetSize;
    const tile = targetSize / GRID_SIZE;

    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        const rawScore = clamp(Number(heatmap16x16[r]?.[c]) || 0, 0, 1);
        if (rawScore < majorIssueStats.cutoff) continue;

        const severity = clamp(
          (rawScore - majorIssueStats.cutoff) / Math.max(1e-6, 1 - majorIssueStats.cutoff),
          0,
          1
        );

        const x0 = c * tile;
        const y0 = r * tile;
        const x1 = (c + 1) * tile;
        const y1 = (r + 1) * tile;

        const ix0 = Math.max(x0, contentLeft);
        const iy0 = Math.max(y0, contentTop);
        const ix1 = Math.min(x1, contentRight);
        const iy1 = Math.min(y1, contentBottom);
        if (ix1 <= ix0 || iy1 <= iy0) continue;

        const drawX = ix0 * scaleX;
        const drawY = iy0 * scaleY;
        const drawW = (ix1 - ix0) * scaleX;
        const drawH = (iy1 - iy0) * scaleY;

        const alpha = overlayMode === "overlay" ? overlayOpacity : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = issueColor(severity);
        ctx.fillRect(drawX, drawY, drawW, drawH);

        if (overlayMode === "grid") {
          ctx.globalAlpha = 0.25;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
          ctx.strokeRect(drawX, drawY, drawW, drawH);
        }
      }
    }

    if (hoverTile) {
      const x0 = hoverTile.col * tile;
      const y0 = hoverTile.row * tile;
      const x1 = (hoverTile.col + 1) * tile;
      const y1 = (hoverTile.row + 1) * tile;

      const ix0 = Math.max(x0, contentLeft);
      const iy0 = Math.max(y0, contentTop);
      const ix1 = Math.min(x1, contentRight);
      const iy1 = Math.min(y1, contentBottom);

      if (ix1 > ix0 && iy1 > iy0) {
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(ix0 * scaleX, iy0 * scaleY, (ix1 - ix0) * scaleX, (iy1 - iy0) * scaleY);
      }
    }

    ctx.globalAlpha = 1;
  }, [heatmap16x16, heatmapMeta, hoverTile, majorIssueStats, overlayMode, overlayOpacity]);

  useEffect(() => {
    drawHeatmap();
  }, [drawHeatmap]);

  useEffect(() => {
    const wrapper = overlayWrapRef.current;
    if (!wrapper) return undefined;

    const onResize = () => drawHeatmap();
    window.addEventListener("resize", onResize);

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(onResize);
      observer.observe(wrapper);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (observer) observer.disconnect();
    };
  }, [drawHeatmap]);

  useEffect(() => {
    setHoverTile(null);
  }, [heatmap16x16, overlayMode]);

  const handleOverlayMove = useCallback((e) => {
    if (!heatmap16x16 || !heatmapMeta || !majorIssueStats || !overlayWrapRef.current) return;

    const rect = overlayWrapRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const targetSize = Math.max(1, Number(heatmapMeta.target_size) || 1024);
    const modelX = (x / rect.width) * targetSize;
    const modelY = (y / rect.height) * targetSize;

    const padLeft = clamp(Number(heatmapMeta.pad_left) || 0, 0, targetSize);
    const padTop = clamp(Number(heatmapMeta.pad_top) || 0, 0, targetSize);
    const resizedWidth = clamp(Number(heatmapMeta.resized_width) || targetSize, 0, targetSize);
    const resizedHeight = clamp(Number(heatmapMeta.resized_height) || targetSize, 0, targetSize);
    const contentRight = clamp(padLeft + resizedWidth, 0, targetSize);
    const contentBottom = clamp(padTop + resizedHeight, 0, targetSize);

    if (modelX < padLeft || modelX >= contentRight || modelY < padTop || modelY >= contentBottom) {
      setHoverTile(null);
      return;
    }

    const tile = targetSize / GRID_SIZE;
    const col = clamp(Math.floor(modelX / tile), 0, GRID_SIZE - 1);
    const row = clamp(Math.floor(modelY / tile), 0, GRID_SIZE - 1);
    const score = clamp(Number(heatmap16x16[row]?.[col]) || 0, 0, 1);
    if (score < majorIssueStats.cutoff) {
      setHoverTile(null);
      return;
    }

    setHoverTile({ row, col, score, x, y });
  }, [heatmap16x16, heatmapMeta, majorIssueStats]);

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

            {backendResult?.success && heatmap16x16 && heatmapMeta && displayImageUrl ? (
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Suggestion Heatmap</div>
                    <div className="text-xs text-[var(--muted)] mt-1">
                      Medium-to-critical issue tiles are shown (yellow to red).
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`pill ghost ${overlayMode === "overlay" ? "" : "opacity-70"}`}
                      onClick={() => setOverlayMode("overlay")}
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                    >
                      Overlay
                    </button>
                    <button
                      type="button"
                      className={`pill ghost ${overlayMode === "grid" ? "" : "opacity-70"}`}
                      onClick={() => setOverlayMode("grid")}
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                    >
                      Grid View
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <label htmlFor="overlay-opacity" className="text-xs text-[var(--muted)]">
                    Opacity
                  </label>
                  <input
                    id="overlay-opacity"
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    disabled={overlayMode === "grid"}
                    className={overlayMode === "grid" ? "opacity-60" : ""}
                  />
                  <span className="text-xs text-[var(--muted)]">
                    {Math.round(overlayOpacity * 100)}%
                  </span>
                </div>
                {majorIssueStats ? (
                  <div className="mt-2 text-xs text-[var(--muted)]">
                    Threshold: score >= {majorIssueStats.cutoff.toFixed(2)} ({majorIssueStats.shown}/{majorIssueStats.total} tiles shown)
                  </div>
                ) : null}

                <div
                  ref={overlayWrapRef}
                  className="relative mt-4 w-full max-w-[700px] aspect-square mx-auto rounded-xl overflow-hidden border border-white/10 bg-white"
                >
                  <img
                    src={displayImageUrl}
                    alt="Suggestion base"
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ opacity: overlayMode === "overlay" ? 1 : 0 }}
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 h-full w-full"
                    onMouseMove={handleOverlayMove}
                    onMouseLeave={() => setHoverTile(null)}
                  />

                  {hoverTile ? (
                    <div
                      className="absolute rounded-md border border-white/20 bg-black/80 px-2 py-1 text-xs text-white"
                      style={{
                        left: clamp(hoverTile.x + 12, 8, (overlayWrapRef.current?.clientWidth || 0) - 160),
                        top: clamp(hoverTile.y + 12, 8, (overlayWrapRef.current?.clientHeight || 0) - 44),
                        pointerEvents: "none",
                      }}
                    >
                      r{hoverTile.row}, c{hoverTile.col} • {hoverTile.score.toFixed(3)}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="text-xs text-[var(--muted)]">
                    Content box: {heatmapMeta.resized_width}×{heatmapMeta.resized_height} (pad left {heatmapMeta.pad_left}, top {heatmapMeta.pad_top})
                  </div>
                  <div className="text-xs text-[var(--muted)] md:text-right">
                    Tiling: {GRID_SIZE}×{GRID_SIZE}
                  </div>
                </div>

                {topTiles.length ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold mb-2">Top medium/high issue tiles</div>
                    <div className="grid gap-1 text-xs text-[var(--muted)] md:grid-cols-2">
                      {topTiles.map((tile) => (
                        <button
                          key={`${tile.row}-${tile.col}`}
                          type="button"
                          className="text-left rounded-md border border-white/10 bg-black/15 px-2 py-1 hover:bg-black/30"
                          onMouseEnter={() =>
                            setHoverTile((prev) => ({
                              ...(prev || {}),
                              row: tile.row,
                              col: tile.col,
                              score: Number(tile.score) || 0,
                              x: prev?.x || 12,
                              y: prev?.y || 12,
                            }))
                          }
                          onMouseLeave={() => setHoverTile(null)}
                        >
                          row {tile.row}, col {tile.col} • {(Number(tile.score) || 0).toFixed(3)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : majorIssueStats ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs text-[var(--muted)]">
                      No medium/high issue tiles above threshold.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

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
