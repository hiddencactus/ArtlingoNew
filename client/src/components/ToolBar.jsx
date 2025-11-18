import React from "react";

export default function Toolbar({
  autoAnalyze,
  setAutoAnalyze,
  hasSuggestion,
  showSuggestion,
  setShowSuggestion,
  tool,
  setTool,
  brushSize,
  setBrushSize,
  color,
  setColor,
}) {
  return (
    <div className="canvas-toolbar">
      <span className="chip">Brush · Size {brushSize} · {color.toUpperCase()}</span>

      <div className="row gap-12">
        <label className="row gap-8">
          <span>Size (px)</span>
          <div className="row" style={{ gap: 4 }}>
            <button
              type="button"
              className="pill ghost"
              onClick={() => setBrushSize((s) => Math.max(1, Math.min(100, s - 1)))}
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
              onClick={() => setBrushSize((s) => Math.max(1, Math.min(100, s + 1)))}
            >
              +
            </button>
          </div>
        </label>

        <label className="row gap-8">
          <span>Color</span>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
          <span>Auto-analyze</span>
        </label>

        <button className="pill ghost" disabled={!hasSuggestion} onClick={() => setShowSuggestion((v) => !v)}>
          {showSuggestion ? "Hide suggestion" : "View suggestion"}
        </button>

        {/* Tool buttons kept very small / minimal */}
        <div className="row" style={{ gap: 6 }}>
          <button className={`tool-btn ${tool === "Brush" ? "tool-btn--active" : ""}`} onClick={() => setTool("Brush")}>Brush</button>
          <button className={`tool-btn ${tool === "Eraser" ? "tool-btn--active" : ""}`} onClick={() => setTool("Eraser")}>Eraser</button>
          <button className={`tool-btn ${tool === "Fill" ? "tool-btn--active" : ""}`} onClick={() => setTool("Fill")}>Fill</button>
        </div>
      </div>
    </div>
  );
}
