import { useState, useRef, useEffect } from "react";
import Segmented from "../components/Segmented";
import MetricBar from "../components/MetricBar";
import Topbar from "../components/TopBar";

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [length, setLength] = useState("Medium");
  const [reps, setReps] = useState(50);

  const [tool, setTool] = useState("Brush"); // "Brush" | "Eraser" | "Fill"
  const [brushSize, setBrushSize] = useState(6);
  const [color, setColor] = useState("#E4572E");

  const [layers, setLayers] = useState([
    { id: "layer-1", name: "Layer 1", visible: true },
    { id: "layer-2", name: "Layer 2", visible: true }
  ]);
  const [activeLayerId, setActiveLayerId] = useState("layer-1");

  const [isFullscreen, setIsFullscreen] = useState(false);

  const canvasRefs = useRef({}); // { [layerId]: HTMLCanvasElement }
  const historiesRef = useRef({}); // { [layerId]: { history: ImageData[], redo: ImageData[] } }

  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const canvasContainerRef = useRef(null);

  const mastery = [
    // TO-DO: Fetch real mastery data from backend
    // Display core data
    { label: "L1 Straightness & Planning", value: 76 },
    { label: "L2 Speed Control", value: 58 },
    { label: "L3 Micro-stability", value: 41 },
    { label: "C1 Value Grouping", value: 64 },
    { label: "C3 Harmony Awareness", value: 28 },
    { label: "C2 Accent Grouping", value: 52 },
  ];

  // --- Canvas helpers ---

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
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
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

  // Initialize each layer's base state on mount / layer count change
  useEffect(() => {
    layers.forEach((layer, index) => {
      const { canvas, ctx } = getCanvasAndCtxForLayer(layer.id);
      if (!canvas || !ctx) return;

      if (!historiesRef.current[layer.id]) {
        if (index === 0) {
          // Base layer: white background
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          // Higher layers: transparent
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

    // Palm rejection: ignore non-primary touches (useful for tablets which I'm pretty sure will be the main form of input)
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
      width: brushSize
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
    const dt = (now - last.time) || 1;

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
      width: smoothedWidth
    };
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    snapshotCanvas();
  };

  const handleUndo = () => {
    const { canvas, ctx } = getCanvasAndCtx();
    if (!canvas || !ctx) return;

    const layerId = activeLayerId;
    const layerHist = historiesRef.current[layerId];
    if (!layerHist || layerHist.history.length <= 1) return;

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    layerHist.redo.push(current);

    layerHist.history.pop();
    const prev = layerHist.history[layerHist.history.length - 1];
    ctx.putImageData(prev, 0, 0);
  };

  const handleRedo = () => {
    const { canvas, ctx } = getCanvasAndCtx();
    if (!canvas || !ctx) return;

    const layerId = activeLayerId;
    const layerHist = historiesRef.current[layerId];
    if (!layerHist || layerHist.redo.length === 0) return;

    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    layerHist.history.push(current);

    const next = layerHist.redo.pop();
    ctx.putImageData(next, 0, 0);
  };

  const handleAddLayer = () => {
    const nextIndex = layers.length + 1;
    const id = `layer-${nextIndex}`;
    setLayers((prev) => [...prev, { id, name: `Layer ${nextIndex}`, visible: true }]);
    setActiveLayerId(id);
  };

  const toggleLayerVisibility = (id) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
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

  const renderToolLabel = () => {
    if (tool === "Brush") return "✏️ Brush";
    if (tool === "Eraser") return "🧽 Eraser";
    return "🪣 Fill";
  };

  return (
    <div className="page">
      <Topbar active={activeTab} onChange={onTabChange} />
      <div className="page-body container grid-2">
        {/* Training Canvas */}
        <section className="panel">
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
              <button className="pill ghost" onClick={() => {}}>
                Start drill
              </button>
            </div>
          </header>

          {/* Toolbar (tool, size, color + undo/redo) Add more tools  */}
          <div className="canvas-toolbar">
            <span className="chip">
              {renderToolLabel()} · {brushSize}px · {color.toUpperCase()}
            </span>

            <div className="row gap-12">
              <Segmented
                options={["✏️ Brush", "🧽 Eraser", "🪣 Fill"]}
                value={renderToolLabel()}
                onChange={(val) => {
                  if (val.includes("Brush")) setTool("Brush");
                  else if (val.includes("Eraser")) setTool("Eraser");
                  else setTool("Fill");
                }}
              />

              <label className="row gap-8">
                <span className="label-sm">Size (px)</span>
                <div className="row gap-4">
                  <button
                    type="button"
                    className="pill ghost sm"
                    onClick={() =>
                      setBrushSize((s) => Math.max(1, Math.min(100, s - 1)))
                    }
                  >
                    -
                  </button>
                  <input
                    className="input input-sm"
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
                    className="pill ghost sm"
                    onClick={() =>
                      setBrushSize((s) => Math.max(1, Math.min(100, s + 1)))
                    }
                  >
                    +
                  </button>
                </div>
              </label>

              <label className="row gap-8">
                <span className="label-sm">Color</span>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>

              <button className="pill ghost" type="button" onClick={handleUndo}>
                Undo
              </button>
              <button className="pill ghost" type="button" onClick={handleRedo}>
                Redo
              </button>
            </div>
          </div>

          {/* Canvas + fullscreen button */}
          <div
            className="canvas-box"
            ref={canvasContainerRef}
          >
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
                  inset: 0
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

            <button
              type="button"
              className="canvas-fs-toggle"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? "⤡" : "⤢"}
            </button>
          </div>

          {/* Layers UI */}
          <div className="subpanel subpanel-roomy">
            <h3>Layers</h3>
            <div className="stack-8">
              {layers.map((layer) => (
                <div className="row space-between" key={layer.id}>
                  <label className="row gap-8">
                    <input
                      type="radio"
                      name="active-layer"
                      checked={layer.id === activeLayerId}
                      onChange={() => setActiveLayerId(layer.id)}
                    />
                    <span>{layer.name}</span>
                  </label>
                  <button
                    type="button"
                    className="pill ghost sm"
                    onClick={() => toggleLayerVisibility(layer.id)}
                  >
                    {layer.visible ? "Hide" : "Show"}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="pill ghost"
                onClick={handleAddLayer}
              >
                + Add Layer
              </button>
            </div>
          </div>

          {/* Line Metrics as bars */}
          <div className="subpanel subpanel-roomy">
            <h3>Line Metrics</h3>
            <div className="stack-14">
              <MetricBar label="Straightness" value={82} />
              <MetricBar label="Wobble" value={24} />
            </div>
          </div>
        </section>

        {/* Mastery bars and the drills section */}
        <section className="col-right">
          <div className="panel">
            <header className="panel-head">
              <h2>Recommended Drill</h2>
            </header>

            <div className="form-grid">
              <div className="form-row">
                <label>Length</label>
                <Segmented
                  options={["Short", "Medium", "Long"]}
                  value={length}
                  onChange={setLength}
                />
              </div>

              <div className="form-row">
                <label>Repetitions</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={reps}
                  onChange={(e) =>
                    setReps(parseInt(e.target.value || "0", 10))
                  }
                />
              </div>
            </div>

            <button className="cta" onClick={() => {}}>
              Start Now
            </button>
          </div>

          <div className="panel">
            <header className="panel-head">
              <h2>Mastery</h2>
            </header>

            <div className="stack-10">
              {mastery.map((m) => (
                <MetricBar key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
