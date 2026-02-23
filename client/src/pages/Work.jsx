import { useState, useRef, useEffect, useMemo } from "react";
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

const heatColor = (t) => {
  const x = clamp(t, 0, 1);
  const hue = 52 - 52 * x; // yellow -> red
  return `hsl(${hue}, 95%, ${60 - x * 14}%)`;
};

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const [hasSuggestion] = useState(true);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [overlayOpacity, setOverlayOpacity] = useState(0.45);

  const [layers, setLayers] = useState([
    { id: "layer-1", name: "Layer 1", visible: true },
  ]);

  const [tool, setTool] = useState("Brush"); // "Brush" | "Eraser" | "Fill"
  const [brushSize, setBrushSize] = useState(6);
  const [color, setColor] = useState("#E4572E");

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeLayerId, setActiveLayerId] = useState("layer-1");

  const canvasRefs = useRef({});
  const historiesRef = useRef({});
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const canvasContainerRef = useRef(null);

  const BACKEND_URL = "http://localhost:5000/api/analyze";

  const getCanvasAndCtx = () => {
    const canvas = canvasRefs.current[activeLayerId];
    if (!canvas) return { canvas: null, ctx: null };
    const ctx = canvas.getContext("2d");
    return { canvas, ctx };
  };

  const getCanvasAndCtxForLayer = (layerId) => {
    const canvas = canvasRefs.current[layerId];
    if (!canvas) return { canvas: null, ctx: null };
    const ctx = canvas.getContext("2d");
    return { canvas, ctx };
  };

  const getCanvasCoords = (e) => {
    const { canvas } = getCanvasAndCtx();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const snapshotCanvas = () => {
    const { canvas, ctx } = getCanvasAndCtx();
    if (!canvas || !ctx) return;

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const layerId = activeLayerId;

    if (!historiesRef.current[layerId]) {
      historiesRef.current[layerId] = { history: [img], redo: [] };
    } else {
      historiesRef.current[layerId].history.push(img);
      historiesRef.current[layerId].redo = [];
    }
  };

  useEffect(() => {
    layers.forEach((layer, index) => {
      const { canvas, ctx } = getCanvasAndCtxForLayer(layer.id);
      if (!canvas || !ctx) return;

      if (!historiesRef.current[layer.id]) {
        if (index === 0) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        historiesRef.current[layer.id] = { history: [img], redo: [] };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers.length]);

  const handlePointerDown = (e) => {
    if (isLoading) return;

    const { canvas, ctx } = getCanvasAndCtx();
    if (!canvas || !ctx) return;

    if (e.pointerType === "touch" && !e.isPrimary) return;

    const point = getCanvasCoords(e);
    if (!point) return;

    if (tool === "Fill") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      snapshotCanvas();
      return;
    }

    isDrawingRef.current = true;

    const now = performance.now();
    lastPointRef.current = {
      x: point.x,
      y: point.y,
      time: now,
      width: brushSize,
    };

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "Brush") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
    } else if (tool === "Eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const handlePointerMove = (e) => {
    if (isLoading) return;
    if (!isDrawingRef.current) return;

    const { ctx } = getCanvasAndCtx();
    if (!ctx) return;

    const point = getCanvasCoords(e);
    const last = lastPointRef.current;
    if (!point || !last) return;

    const now = performance.now();
    const dt = now - last.time || 1;

    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = dist / dt;

    const rawPressure = typeof e.pressure === "number" ? e.pressure : 0;
    const pressure = rawPressure > 0 ? rawPressure : 1;

    const tiltX = typeof e.tiltX === "number" ? e.tiltX : 0;
    const tiltFactor = 1 + (Math.min(Math.abs(tiltX), 90) / 90) * 0.2;

    const maxSpeed = 2.5;
    const speedNorm = Math.min(speed / maxSpeed, 1);
    const minFactor = 0.3;
    const maxFactor = 1.2;
    const inv = 1 - speedNorm;

    const targetWidth =
      brushSize *
      pressure *
      tiltFactor *
      (minFactor + inv * (maxFactor - minFactor));

    const smoothedWidth = last.width * 0.7 + targetWidth * 0.3;

    ctx.lineWidth = smoothedWidth;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = {
      x: point.x,
      y: point.y,
      time: now,
      width: smoothedWidth,
    };
  };

  const handlePointerUp = async () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    snapshotCanvas();

    // auto analyze after stroke ends 
    if (autoAnalyze && showSuggestion) {
      await analyzeDrawing();
    }
  };

  const addLayer = () => {
    if (isLoading) return;
    setLayers((prev) => {
      const nextIndex = prev.length + 1;
      const id = `layer-${nextIndex}`;
      setActiveLayerId(id);
      return [...prev, { id, name: `Layer ${nextIndex}`, visible: true }];
    });
  };

  const selectLayer = (id) => {
    if (isLoading) return;
    setActiveLayerId(id);
  };

  const toggleFullscreen = async () => {
    if (isLoading) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      try {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error("Fullscreen error", err);
      }
    } else {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.error("Exit fullscreen error", err);
      }
      setIsFullscreen(false);
    }
  };

  // merge visible layers into an offscreen canvas and return a PNG blob
  const exportMergedPNGBlob = async () => {
    const layerCanvases = layers
      .map((layer) => ({
        layer,
        canvas: canvasRefs.current[layer.id],
      }))
      .filter((entry) => entry.canvas && entry.layer.visible);

    if (layerCanvases.length === 0) return null;

    const baseCanvas = layerCanvases[0].canvas;
    const merged = document.createElement("canvas");
    merged.width = baseCanvas.width;
    merged.height = baseCanvas.height;

    const mctx = merged.getContext("2d");

    // white background so transparent regions don't become black
    mctx.fillStyle = "#FFFFFF";
    mctx.fillRect(0, 0, merged.width, merged.height);

    layerCanvases.forEach(({ canvas }) => {
      mctx.drawImage(canvas, 0, 0);
    });

    return new Promise((resolve) => {
      merged.toBlob((blob) => resolve(blob), "image/png");
    });
  };

  const analyzeDrawing = async () => {
    if (isLoading) return null;

    setIsLoading(true);
    setErrorMsg("");
    setSuggestionResult(null);

    const blob = await exportMergedPNGBlob();
    if (!blob) {
      const msg = "Nothing to analyze yet — draw something first.";
      setErrorMsg(msg);
      setSuggestionResult({ error: true, message: msg });
      setIsLoading(false);
      return null;
    }

    const formData = new FormData();
    formData.append("file", blob, "drawing.png");

    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        body: formData,
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = { success: false, message: "Backend did not return JSON." };
      }

      if (!res.ok || !data?.success) {
        const msg = data?.message || `Backend error ${res.status}`;
        setErrorMsg(msg);
        setSuggestionResult({ error: true, message: msg, raw: data });
        return null;
      }

      setSuggestionResult(data);
      return data;
    } catch (err) {
      console.error("Error analyzing drawing", err);
      const msg =
        err?.message ||
        "Request failed. Is your Flask server running on port 5000?";
      setErrorMsg(msg);
      setSuggestionResult({ error: true, message: msg });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = async () => {
    if (!hasSuggestion || isLoading) return;

    if (!showSuggestion) {
      setShowSuggestion(true);
      await analyzeDrawing();
    } else {
      setShowSuggestion(false);
      setErrorMsg("");
    }
  };

  const heatmap16x16 = useMemo(() => {
    if (Array.isArray(suggestionResult?.heatmap16x16)) return suggestionResult.heatmap16x16;
    if (Array.isArray(suggestionResult?.heatmaps?.issue)) return suggestionResult.heatmaps.issue;
    return null;
  }, [suggestionResult]);

  const heatmapMeta = useMemo(() => {
    if (suggestionResult?.meta) return suggestionResult.meta;
    const preprocess = suggestionResult?.debug?.preprocess;
    if (!preprocess) return null;
    return {
      target_size: Number(preprocess.target_size),
      resized_width: Number(preprocess.resized_width),
      resized_height: Number(preprocess.resized_height),
      pad_left: Number(preprocess.pad_left),
      pad_top: Number(preprocess.pad_top),
    };
  }, [suggestionResult]);

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

  const overlayTiles = useMemo(() => {
    if (!heatmap16x16 || !heatmapMeta || !majorIssueStats) return [];

    const targetSize = Math.max(1, Number(heatmapMeta.target_size) || 1024);
    const padLeft = clamp(Number(heatmapMeta.pad_left) || 0, 0, targetSize);
    const padTop = clamp(Number(heatmapMeta.pad_top) || 0, 0, targetSize);
    const resizedWidth = Math.max(1, clamp(Number(heatmapMeta.resized_width) || targetSize, 0, targetSize));
    const resizedHeight = Math.max(1, clamp(Number(heatmapMeta.resized_height) || targetSize, 0, targetSize));
    const contentRight = clamp(padLeft + resizedWidth, 0, targetSize);
    const contentBottom = clamp(padTop + resizedHeight, 0, targetSize);
    const tileSize = targetSize / GRID_SIZE;

    const tiles = [];
    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        const x0 = c * tileSize;
        const y0 = r * tileSize;
        const x1 = (c + 1) * tileSize;
        const y1 = (r + 1) * tileSize;

        // Clip tile to content box to exclude letterbox padding completely
        const ix0 = Math.max(x0, padLeft);
        const iy0 = Math.max(y0, padTop);
        const ix1 = Math.min(x1, contentRight);
        const iy1 = Math.min(y1, contentBottom);
        if (ix1 <= ix0 || iy1 <= iy0) continue;

        // Map from model-content coordinates back to displayed canvas coordinates
        const xPct = ((ix0 - padLeft) / resizedWidth) * 100;
        const yPct = ((iy0 - padTop) / resizedHeight) * 100;
        const wPct = ((ix1 - ix0) / resizedWidth) * 100;
        const hPct = ((iy1 - iy0) / resizedHeight) * 100;

        const rawScore = clamp(Number(heatmap16x16?.[r]?.[c]) || 0, 0, 1);
        if (rawScore < majorIssueStats.cutoff) continue;

        const severity = clamp(
          (rawScore - majorIssueStats.cutoff) / Math.max(1e-6, 1 - majorIssueStats.cutoff),
          0,
          1
        );

        tiles.push({
          key: `heatmap-${r}-${c}`,
          xPct,
          yPct,
          wPct,
          hPct,
          fill: heatColor(severity),
          rawScore,
        });
      }
    }
    return tiles;
  }, [majorIssueStats, heatmapMeta, heatmap16x16]);

  // ---- UI helpers for user-friendly results ----
  const getScore = (key) => {
    const v = suggestionResult?.metrics?.[key];
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  };

  const overallScore = (() => {
    const n = Number(suggestionResult?.overall);
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
          <div className="h-full rounded-full bg-white/80" style={{ width: `${safe}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="page min-h-screen flex flex-col">
      <Topbar active={activeTab} onChange={onTabChange} />

      {/* Blocking overlay + loading bar */}
      {isLoading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-[min(520px,92vw)] rounded-2xl bg-white p-6 shadow-xl">
            <div className="text-lg font-semibold">Analyzing your drawing...</div>
            <div className="mt-2 text-sm text-gray-600">
              Please wait — don’t tap anything while we process it.
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

      <div className="page-body container flex-1 flex gap-6 items-stretch">
        {/* Training Canvas */}
        <section className="panel flex-1 min-w-0 flex flex-col">
          <header className="panel-head">
            <h2>Training Canvas</h2>
            <div className="row gap-12">
              <label className={`checkbox ${isLoading ? "opacity-60 pointer-events-none" : ""}`}>
                <input
                  type="checkbox"
                  checked={autoAnalyze}
                  onChange={(e) => setAutoAnalyze(e.target.checked)}
                  disabled={isLoading}
                />
                <span>Auto-analyze</span>
              </label>

              <button
                className={`pill ghost ${(!hasSuggestion || isLoading) ? "opacity-60 cursor-not-allowed" : ""}`}
                disabled={!hasSuggestion || isLoading}
                onClick={handleSuggestionClick}
              >
                {showSuggestion ? "Hide suggestion" : "View suggestion"}
              </button>
            </div>
          </header>

          <div className={`canvas-toolbar ${isLoading ? "opacity-60 pointer-events-none" : ""}`}>
            <span className="chip">
              Brush · Size {brushSize} · {color.toUpperCase()}
            </span>

            <div className="row gap-12">
              <label className="row gap-8">
                <span>Size (px)</span>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="pill ghost"
                    onClick={() => setBrushSize((s) => Math.max(1, Math.min(100, s - 1)))}
                    disabled={isLoading}
                  >
                    -
                  </button>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={100}
                    value={brushSize}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isNaN(val)) return;
                      setBrushSize(Math.max(1, Math.min(100, val)));
                    }}
                    style={{ width: "64px" }}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    className="pill ghost"
                    onClick={() => setBrushSize((s) => Math.max(1, Math.min(100, s + 1)))}
                    disabled={isLoading}
                  >
                    +
                  </button>
                </div>
              </label>

              <label className="row gap-8">
                <span>Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={isLoading}
                />
              </label>
            </div>
          </div>

          {/* Main drawing surface */}
          <div className="canvas-box flex-1" ref={canvasContainerRef}>
            {layers.map((layer) => (
              <canvas
                key={layer.id}
                ref={(el) => {
                  canvasRefs.current[layer.id] = el;
                }}
                className="canvas-element"
                style={{
                  opacity: layer.visible ? 1 : 0,
                  pointerEvents: layer.id === activeLayerId && !isLoading ? "auto" : "none",
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                }}
                width={1600}
                height={900}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onPointerCancel={handlePointerUp}
              />
            ))}

            {/* Heatmap overlay (aligned using model letterbox metadata) */}
            {showSuggestion && suggestionResult?.success && overlayTiles.length > 0 && (
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {overlayTiles.map((tile) => (
                  <rect
                    key={tile.key}
                    x={tile.xPct}
                    y={tile.yPct}
                    width={tile.wPct}
                    height={tile.hPct}
                    fill={tile.fill}
                    fillOpacity={overlayOpacity}
                    stroke="rgba(255,255,255,0.16)"
                    strokeWidth={0.08}
                  />
                ))}
              </svg>
            )}

            {/* Suggestion panel (user-facing) */}
            {showSuggestion && (
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  width: 360,
                  maxWidth: "min(360px, 90vw)",
                  background: "rgba(0,0,0,0.72)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "14px 14px",
                  borderRadius: "16px",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>
                  Suggestions
                </div>

                {suggestionResult?.success && overlayTiles.length > 0 && (
                  <div style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 4 }}>
                      <strong>Heatmap overlay:</strong> medium-to-critical issues are shown
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: "linear-gradient(to right, hsl(52, 95%, 60%), hsl(28, 95%, 54%), hsl(0, 95%, 46%))",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 3, opacity: 0.7 }}>
                      <span>Medium issue</span>
                      <span>Critical issue</span>
                    </div>
                    <div style={{ fontSize: 10, opacity: 0.68, marginTop: 4 }}>
                      Threshold: score >= {majorIssueStats?.cutoff?.toFixed(2)} ({majorIssueStats?.shown}/{majorIssueStats?.total} tiles shown)
                    </div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, opacity: 0.75 }}>Opacity</span>
                      <input
                        type="range"
                        min={0.1}
                        max={0.9}
                        step={0.05}
                        value={overlayOpacity}
                        onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  </div>
                )}

                {suggestionResult?.success && overlayTiles.length === 0 && majorIssueStats && (
                  <div style={{ marginBottom: 10, padding: "8px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, opacity: 0.82 }}>
                      No medium/high issue tiles above threshold ({majorIssueStats.cutoff.toFixed(2)}).
                    </div>
                  </div>
                )}

                {errorMsg ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
                    <div className="font-semibold">Couldn’t analyze</div>
                    <div className="text-[var(--muted)] mt-1">{errorMsg}</div>
                  </div>
                ) : suggestionResult?.success ? (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ opacity: 0.9, fontSize: 12 }}>
                        Quick feedback (no technical details).
                      </div>

                      {overallScore != null ? (
                        <div
                          style={{
                            background: "rgba(255,255,255,0.10)",
                            padding: "10px 12px",
                            borderRadius: 14,
                            textAlign: "right",
                            minWidth: 92,
                          }}
                        >
                          <div style={{ fontSize: 10, opacity: 0.8 }}>Overall</div>
                          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>
                            {overallScore}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.8 }}>
                            {scoreLabel(overallScore)}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      <Metric
                        title="Line Quality"
                        subtitle="Cleaner, more confident strokes."
                        score={getScore("line") ?? 0}
                      />
                      <Metric
                        title="Values (Light / Dark)"
                        subtitle="Stronger contrast and depth."
                        score={getScore("value") ?? 0}
                      />
                      <Metric
                        title="Color Harmony"
                        subtitle="Colors feel like they belong together."
                        score={getScore("harmony") ?? 0}
                      />
                    </div>

                    <button
                      type="button"
                      className={`pill ghost mt-3 ${isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
                      onClick={analyzeDrawing}
                      disabled={isLoading}
                      style={{ width: "100%" }}
                      title="Run analysis again"
                    >
                      Re-run analysis
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Click “View suggestion” to analyze your drawing.
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className={`canvas-fs-toggle ${isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={toggleFullscreen}
              disabled={isLoading}
            >
              {isFullscreen ? "⤡" : "⤢"}
            </button>
          </div>
        </section>

        {/* Tools sidebar */}
        <aside
          className={`flex flex-col items-center w-16 flex-shrink-0
                     rounded-3xl bg-[var(--panel-2)]
                     shadow-[0_18px_60px_rgba(0,0,0,0.6)] py-3 px-2
                     ${isLoading ? "opacity-60 pointer-events-none" : ""}`}
        >
          <div className="flex flex-col gap-2 mb-3">
            <button
              className={`tool-btn ${tool === "Brush" ? "tool-btn--active" : ""}`}
              title="Brush"
              onClick={() => setTool("Brush")}
            >
              B
            </button>
            <button
              className={`tool-btn ${tool === "Eraser" ? "tool-btn--active" : ""}`}
              title="Eraser"
              onClick={() => setTool("Eraser")}
            >
              E
            </button>
            <button className="tool-btn" title="Color picker">
              C
            </button>
            <button className="tool-btn" title="Toggle harmony overlay">
              H
            </button>
            <button className="tool-btn" title="Toggle value map">
              V
            </button>
          </div>

          <div className="h-px w-8 bg-black/40 mb-3" />

          <div className="flex flex-col items-center gap-2 w-full">
            <span className="text-[9px] tracking-wide uppercase text-[var(--muted)]">
              Layers
            </span>
            <div className="flex flex-col gap-1 w-full items-center">
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  className={`layer-btn ${layer.id === activeLayerId ? "layer-btn--active" : ""}`}
                  onClick={() => selectLayer(layer.id)}
                  title={layer.name}
                >
                  {layer.name.replace("Layer ", "L")}
                </button>
              ))}
              <button
                type="button"
                onClick={addLayer}
                className="layer-btn text-lg leading-none"
                title="Add layer"
              >
                +
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
