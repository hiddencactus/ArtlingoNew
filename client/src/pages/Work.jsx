import { useState, useRef, useEffect } from "react";
import Topbar from "../components/TopBar";

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const [hasSuggestion] = useState(true);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestionResult, setSuggestionResult] = useState(null);

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
          // base layer: white background
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          // higher layers: transparent
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        historiesRef.current[layer.id] = { history: [img], redo: [] };
      }
    });
  }, [layers.length]);

  const handlePointerDown = (e) => {
    const { canvas, ctx } = getCanvasAndCtx();
    if (!canvas || !ctx) return;

    if (e.pointerType === "touch" && !e.isPrimary) {
      return;
    }

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
    const speed = dist / dt; // px per ms

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

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    snapshotCanvas();

    // could auto-trigger analyze here if autoAnalyze === true
  };

  const addLayer = () => {
    setLayers((prev) => {
      const nextIndex = prev.length + 1;
      const id = `layer-${nextIndex}`;
      setActiveLayerId(id);
      return [...prev, { id, name: `Layer ${nextIndex}`, visible: true }];
    });
  };

  const selectLayer = (id) => {
    setActiveLayerId(id);
  };

  const toggleFullscreen = async () => {
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
    const blob = await exportMergedPNGBlob();
    if (!blob) {
      console.warn("No merged image available");
      return null;
    }

    const formData = new FormData();
    formData.append("file", blob, "drawing.png");

    try {
      const res = await fetch("http://localhost:5000/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        console.error("Backend error:", res.status);
        return null;
      }

      const data = await res.json();
      setSuggestionResult(data);
      return data;
    } catch (err) {
      console.error("Error analyzing drawing", err);
      return null;
    }
  };

  const handleSuggestionClick = async () => {
    if (!hasSuggestion) return;

    if (!showSuggestion) {
      await analyzeDrawing();
      setShowSuggestion(true);
    } else {
      setShowSuggestion(false);
    }
  };

  return (
    <div className="page min-h-screen flex flex-col">
      <Topbar active={activeTab} onChange={onTabChange} />
      <div className="page-body container flex-1 flex gap-6 items-stretch">
        {/* Training Canvas */}
        <section className="panel flex-1 min-w-0 flex flex-col">
          <header className="panel-head">
            <h2>Training Canvas</h2>
            <div className="row gap-12">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={autoAnalyze}
                  onChange={(e) => setAutoAnalyze(e.target.checked)}
                />
                <span>Auto-analyze</span>
              </label>

              <button
                className="pill ghost"
                disabled={!hasSuggestion}
                onClick={handleSuggestionClick}
              >
                {showSuggestion ? "Hide suggestion" : "View suggestion"}
              </button>
            </div>
          </header>

          <div className="canvas-toolbar">
            <span className="chip">
              Brush · Size {brushSize} · {color.toUpperCase()}
            </span>

            {/* Brush size + color controls */}
            <div className="row gap-12">
              {/* Size control */}
              <label className="row gap-8">
                <span>Size (px)</span>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    type="button"
                    className="pill ghost"
                    onClick={() =>
                      setBrushSize((s) => Math.max(1, Math.min(100, s - 1)))
                    }
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
                  />
                  <button
                    type="button"
                    className="pill ghost"
                    onClick={() =>
                      setBrushSize((s) => Math.max(1, Math.min(100, s + 1)))
                    }
                  >
                    +
                  </button>
                </div>
              </label>

              {/* Color control */}
              <label className="row gap-8">
                <span>Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Main drawing surface: stacked canvases for each layer */}
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
                  pointerEvents: layer.id === activeLayerId ? "auto" : "none",
                  position: "absolute",
                  inset: 0,
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

            {showSuggestion && (
              <div className="canvas-suggestion-overlay">
                <div className="canvas-suggestion-label">
                  {suggestionResult?.suggested_color
                    ? `Suggested color: ${suggestionResult.suggested_color}`
                    : "Preview: suggested color fix"}
                </div>
              </div>
            )}

            <button
              type="button"
              className="canvas-fs-toggle"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "⤡" : "⤢"}
            </button>
          </div>
        </section>

        {/* replace with icons later */}
        <aside
          className="flex flex-col items-center w-16 flex-shrink-0
                     rounded-3xl bg-[var(--panel-2)]
                     shadow-[0_18px_60px_rgba(0,0,0,0.6)] py-3 px-2"
        >
          {/* tools */}
          <div className="flex flex-col gap-2 mb-3">
            <button
              className={`tool-btn ${
                tool === "Brush" ? "tool-btn--active" : ""
              }`}
              title="Brush"
              onClick={() => setTool("Brush")}
            >
              B
            </button>
            <button
              className={`tool-btn ${
                tool === "Eraser" ? "tool-btn--active" : ""
              }`}
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

          {/* layer system */}
          <div className="flex flex-col items-center gap-2 w-full">
            <span className="text-[9px] tracking-wide uppercase text-[var(--muted)]">
              Layers
            </span>
            <div className="flex flex-col gap-1 w-full items-center">
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  className={`layer-btn ${
                    layer.id === activeLayerId ? "layer-btn--active" : ""
                  }`}
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
