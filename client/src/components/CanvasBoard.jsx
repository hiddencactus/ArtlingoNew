import React, { useRef, useEffect, forwardRef, useImperativeHandle } from "react";

/*
  Minimal CanvasBoard:
   - stacked canvases per layer
   - drawing handlers (Brush, Eraser, Fill)
   - simple per-layer histories (snapshot after stroke)
   - keeps canvasRefs and histories in refs (no rerenders)
*/

const CanvasBoard = forwardRef(({ layers, activeLayerId, tool, brushSize, color, showSuggestion }, ref) => {
  const canvasContainerRef = useRef(null);
  const canvasRefs = useRef({});
  const historiesRef = useRef({});
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);

  // Expose a tiny API if you want later (currently unused)
  useImperativeHandle(ref, () => ({
    // placeholder, no-op: kept so parent can get the ref later if needed
  }));

  // initialize layers once their canvases mount
  useEffect(() => {
    layers.forEach((layer, idx) => {
      const c = canvasRefs.current[layer.id];
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!historiesRef.current[layer.id]) {
        if (idx === 0) {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, c.width, c.height);
        } else {
          ctx.clearRect(0, 0, c.width, c.height);
        }
        const img = ctx.getImageData(0, 0, c.width, c.height);
        historiesRef.current[layer.id] = { history: [img], redo: [] };
      }
    });
  }, [layers.length]);

  const getCanvas = (id = activeLayerId) => canvasRefs.current[id] || null;
  const getCtx = (id = activeLayerId) => {
    const c = getCanvas(id);
    return c ? c.getContext("2d") : null;
  };

  const getCanvasCoords = (e, canvas) => {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const snapshotCanvas = (layerId) => {
    const canvas = getCanvas(layerId);
    const ctx = getCtx(layerId);
    if (!canvas || !ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!historiesRef.current[layerId]) historiesRef.current[layerId] = { history: [img], redo: [] };
    else {
      historiesRef.current[layerId].history.push(img);
      historiesRef.current[layerId].redo = [];
    }
  };

  // pointer handlers
  const handlePointerDown = (e, layerId) => {
    const canvas = getCanvas(layerId);
    const ctx = getCtx(layerId);
    if (!canvas || !ctx) return;
    if (e.pointerType === "touch" && !e.isPrimary) return; // palm rejection

    const point = getCanvasCoords(e, canvas);
    if (!point) return;

    if (tool === "Fill") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      snapshotCanvas(layerId);
      return;
    }

    isDrawingRef.current = true;
    canvas.setPointerCapture?.(e.pointerId);

    const now = performance.now();
    lastPointRef.current = { x: point.x, y: point.y, time: now, width: brushSize };

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

  const handlePointerMove = (e, layerId) => {
    if (!isDrawingRef.current) return;
    const ctx = getCtx(layerId);
    const canvas = getCanvas(layerId);
    if (!ctx || !canvas) return;

    const point = getCanvasCoords(e, canvas);
    const last = lastPointRef.current;
    if (!point || !last) return;

    const now = performance.now();
    const dt = now - last.time || 1;
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const speed = dist / dt;

    const rawPressure = typeof e.pressure === "number" ? e.pressure : 1;
    const pressure = rawPressure > 0 ? rawPressure : 1;

    const tiltX = typeof e.tiltX === "number" ? e.tiltX : 0;
    const tiltFactor = 1 + (Math.min(Math.abs(tiltX), 90) / 90) * 0.2;

    const maxSpeed = 2.5;
    const speedNorm = Math.min(speed / maxSpeed, 1);
    const minFactor = 0.3;
    const maxFactor = 1.2;
    const inv = 1 - speedNorm;

    const targetWidth =
      brushSize * pressure * tiltFactor * (minFactor + inv * (maxFactor - minFactor));
    const smoothedWidth = last.width * 0.7 + targetWidth * 0.3;

    ctx.lineWidth = smoothedWidth;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    lastPointRef.current = { x: point.x, y: point.y, time: now, width: smoothedWidth };
  };

  const handlePointerUp = (e, layerId) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      const canvas = getCanvas(layerId);
      canvas?.releasePointerCapture?.(e.pointerId);
    } catch (err) { /* ignore */ }
    snapshotCanvas(layerId);
  };

  return (
    <div className="canvas-box flex-1" ref={canvasContainerRef}>
      {layers.map((layer) => (
        <canvas
          key={layer.id}
          ref={(el) => (canvasRefs.current[layer.id] = el)}
          className="canvas-element"
          style={{
            opacity: layer.visible ? 1 : 0,
            pointerEvents: layer.id === activeLayerId ? "auto" : "none",
            position: "absolute",
            inset: 0,
          }}
          width={1600}
          height={900}
          onPointerDown={(e) => handlePointerDown(e, layer.id)}
          onPointerMove={(e) => handlePointerMove(e, layer.id)}
          onPointerUp={(e) => handlePointerUp(e, layer.id)}
          onPointerLeave={(e) => handlePointerUp(e, layer.id)}
          onPointerCancel={(e) => handlePointerUp(e, layer.id)}
        />
      ))}

      {showSuggestion && (
        <div className="canvas-suggestion-overlay">
          <div className="canvas-suggestion-label">Preview: suggested color fix</div>
        </div>
      )}
    </div>
  );
});

export default CanvasBoard;
