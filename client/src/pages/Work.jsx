import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Topbar from "../components/TopBar";

const GRID_SIZE = 16;
const MAJOR_ISSUE_MIN_SCORE = 0.7;
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
  const [hasSuggestion] = useState(true);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [overlayOpacity, setOverlayOpacity] = useState(0.45);
  const [isPenDrawing, setIsPenDrawing] = useState(false);

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
  const activePointerIdRef = useRef(null);
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

  useEffect(() => {
    const onFullscreenChange = () => {
      const container = canvasContainerRef.current;
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(Boolean(container && fullscreenElement === container));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  const handlePointerDown = (e) => {
    if (isLoading) return;

    const { canvas, ctx } = getCanvasAndCtx();
    if (!canvas || !ctx) return;

    if (e.pointerType === "touch" && !e.isPrimary) return;
    if (isDrawingRef.current) return;

    const point = getCanvasCoords(e);
    if (!point) return;

    e.preventDefault();

    if (tool === "Fill") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      snapshotCanvas();
      return;
    }

    activePointerIdRef.current = e.pointerId;
    setIsPenDrawing((e.pointerType || "") === "pen");
    if (typeof e.currentTarget?.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Some input devices/browsers may reject capture; drawing still continues.
      }
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
    if (activePointerIdRef.current != null && e.pointerId !== activePointerIdRef.current) return;

    const { ctx } = getCanvasAndCtx();
    if (!ctx) return;

    const point = getCanvasCoords(e);
    const last = lastPointRef.current;
    if (!point || !last) return;

    e.preventDefault();

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

  const handlePointerUp = async (e) => {
    if (activePointerIdRef.current != null && e?.pointerId != null && e.pointerId !== activePointerIdRef.current) {
      return;
    }
    if (!isDrawingRef.current) return;

    if (
      e?.pointerId != null &&
      typeof e.currentTarget?.hasPointerCapture === "function" &&
      e.currentTarget.hasPointerCapture(e.pointerId)
    ) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release failures; state cleanup below is sufficient.
      }
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
    activePointerIdRef.current = null;
    setIsPenDrawing(false);
    snapshotCanvas();
  };

  const undoActiveLayer = useCallback(() => {
    if (isLoading) return;
    if (isDrawingRef.current) return;

    const layerId = activeLayerId;
    const historyState = historiesRef.current[layerId];
    if (!historyState || historyState.history.length <= 1) return;

    const { ctx } = getCanvasAndCtxForLayer(layerId);
    if (!ctx) return;

    const current = historyState.history.pop();
    if (current) historyState.redo.push(current);

    const previous = historyState.history[historyState.history.length - 1];
    if (!previous) return;
    ctx.putImageData(previous, 0, 0);
  }, [activeLayerId, isLoading]);

  const redoActiveLayer = useCallback(() => {
    if (isLoading) return;
    if (isDrawingRef.current) return;

    const layerId = activeLayerId;
    const historyState = historiesRef.current[layerId];
    if (!historyState || historyState.redo.length === 0) return;

    const { ctx } = getCanvasAndCtxForLayer(layerId);
    if (!ctx) return;

    const next = historyState.redo.pop();
    if (!next) return;
    historyState.history.push(next);
    ctx.putImageData(next, 0, 0);
  }, [activeLayerId, isLoading]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        target?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";
      if (isEditable) return;

      const key = String(e.key || "").toLowerCase();
      const hasMod = e.ctrlKey || e.metaKey;
      if (!hasMod) {
        if (key === "b") {
          e.preventDefault();
          setTool("Brush");
        } else if (key === "e") {
          e.preventDefault();
          setTool("Eraser");
        }
        return;
      }

      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redoActiveLayer();
        } else {
          undoActiveLayer();
        }
        return;
      }

      // Common Windows/Linux redo shortcut
      if (key === "y") {
        e.preventDefault();
        redoActiveLayer();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redoActiveLayer, undoActiveLayer]);

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

    const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;

    if (!fullscreenElement) {
      try {
        if (typeof container.requestFullscreen === "function") {
          await container.requestFullscreen();
        } else if (typeof container.webkitRequestFullscreen === "function") {
          container.webkitRequestFullscreen();
        }
      } catch (err) {
        console.error("Fullscreen error", err);
      }
      return;
    }

    try {
      if (typeof document.exitFullscreen === "function") {
        await document.exitFullscreen();
      } else if (typeof document.webkitExitFullscreen === "function") {
        document.webkitExitFullscreen();
      }
    } catch (err) {
      console.error("Exit fullscreen error", err);
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
      const msg = "Nothing to analyze yet - draw something first.";
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
    const shown = rawScores.filter((s) => s > cutoff).length;

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
        if (rawScore <= majorIssueStats.cutoff) continue;

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
      {isLoading && !isFullscreen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative w-[min(520px,92vw)] rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="text-center text-xl font-bold text-gray-900">Analyzing your drawing...</div>

            <div className="mt-6 flex justify-center">
              <div className="h-3 w-[min(360px,82vw)] overflow-hidden rounded-full bg-gray-200">
                <div className="h-full w-1/3 animate-[progress_1.1s_infinite] rounded-full bg-gray-900" />
              </div>
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
		            <div className="row gap-12">
	              <label className="row gap-8">
	                <span>Size (px)</span>
	                <input
	                  type="range"
	                  min={1}
	                  max={100}
	                  step={1}
	                  value={brushSize}
	                  onChange={(e) => setBrushSize(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
	                  style={{ width: "180px" }}
	                  disabled={isLoading}
	                />
	                <span className="chip" style={{ minWidth: "44px", justifyContent: "center" }}>
	                  {brushSize}
	                </span>
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
          <div className={`canvas-box ${isFullscreen ? "canvas-box--fullscreen" : ""} ${isPenDrawing ? "canvas-box--pen-drawing" : ""}`} ref={canvasContainerRef}>
            {isLoading && isFullscreen && (
              <div className="absolute inset-0 z-[30] flex items-center justify-center">
                <div className="absolute inset-0 bg-black/55" />
                <div className="relative w-[min(520px,92vw)] rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
                  <div className="text-center text-xl font-bold text-gray-900">Analyzing your drawing...</div>

                  <div className="mt-6 flex justify-center">
                    <div className="h-3 w-[min(360px,82vw)] overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full w-1/3 animate-[progress_1.1s_infinite] rounded-full bg-gray-900" />
                    </div>
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

            {isFullscreen && (
              <div className="canvas-fs-tools">
                <label className="canvas-fs-tools-group">
                  <span className="canvas-fs-tools-label">Size</span>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    disabled={isLoading}
                    style={{ width: "160px" }}
                  />
                  <span className="canvas-fs-size-value">{brushSize}px</span>
                </label>

                <label className="canvas-fs-tools-group">
                  <span className="canvas-fs-tools-label">Color</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={isLoading}
                  />
                </label>
              </div>
            )}

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
                  touchAction: "none",
                }}
                width={1600}
                height={900}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onLostPointerCapture={handlePointerUp}
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

            {isFullscreen && (
              <button
                type="button"
                className={`canvas-suggestion-toggle pill ghost ${(!hasSuggestion || isLoading) ? "opacity-60 cursor-not-allowed" : ""}`}
                disabled={!hasSuggestion || isLoading}
                onClick={handleSuggestionClick}
              >
                {showSuggestion ? "Hide suggestion" : "View suggestion"}
              </button>
            )}

            {/* Suggestion panel (user-facing) */}
            {showSuggestion && (
              <div className={`canvas-suggestion-panel ${isFullscreen ? "canvas-suggestion-panel--fullscreen" : ""}`}>
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
                      Threshold: score > {majorIssueStats?.cutoff?.toFixed(2)} ({majorIssueStats?.shown}/{majorIssueStats?.total} tiles shown)
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
                    <div className="font-semibold">Couldn't analyze</div>
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
                    Click "View suggestion" to analyze your drawing.
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className={`canvas-fs-toggle ${isLoading ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={toggleFullscreen}
              disabled={isLoading}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? (
                <svg className="tool-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M1 6h1V2h4V1H1zm14 0h-1V2h-4V1h5zM1 10h1v4h4v1H1zm14 0h-1v4h-4v1h5zM4 8.5A.5.5 0 0 1 4.5 8h2A.5.5 0 0 1 7 8.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm5 0A.5.5 0 0 1 9.5 8h2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5z" />
                </svg>
              ) : (
                <svg className="tool-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M1 1h5v1H2v4H1zm9 0h5v5h-1V2h-4zM1 10h1v4h4v1H1zm13 0h1v5h-5v-1h4z" />
                </svg>
              )}
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
              aria-label="Brush"
              onClick={() => setTool("Brush")}
            >
              <svg className="tool-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M15.825.12a.5.5 0 0 1 .132.584c-1.53 3.43-4.743 8.17-7.095 10.64a6.1 6.1 0 0 1-2.373 1.534c-.018.227-.06.538-.16.868-.201.659-.667 1.479-1.708 1.74a8.1 8.1 0 0 1-3.078.132 4 4 0 0 1-.562-.135 1.4 1.4 0 0 1-.466-.247.7.7 0 0 1-.204-.288.62.62 0 0 1 .004-.443c.095-.245.316-.38.461-.452.394-.197.625-.453.867-.826.095-.144.184-.297.287-.472l.117-.198c.151-.255.326-.54.546-.848.528-.739 1.201-.925 1.746-.896q.19.012.348.048c.062-.172.142-.38.238-.608.261-.619.658-1.419 1.187-2.069 2.176-2.67 6.18-6.206 9.117-8.104a.5.5 0 0 1 .596.04M4.705 11.912a1.2 1.2 0 0 0-.419-.1c-.246-.013-.573.05-.879.479-.197.275-.355.532-.5.777l-.105.177c-.106.181-.213.362-.32.528a3.4 3.4 0 0 1-.76.861c.69.112 1.736.111 2.657-.12.559-.139.843-.569.993-1.06a3 3 0 0 0 .126-.75zm1.44.026c.12-.04.277-.1.458-.183a5.1 5.1 0 0 0 1.535-1.1c1.9-1.996 4.412-5.57 6.052-8.631-2.59 1.927-5.566 4.66-7.302 6.792-.442.543-.795 1.243-1.042 1.826-.121.288-.214.54-.275.72v.001l.575.575zm-4.973 3.04.007-.005zm3.582-3.043.002.001h-.002z" />
              </svg>
            </button>
            <button
              className={`tool-btn ${tool === "Eraser" ? "tool-btn--active" : ""}`}
              title="Eraser"
              aria-label="Eraser"
              onClick={() => setTool("Eraser")}
            >
              <svg className="tool-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293z" />
              </svg>
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
