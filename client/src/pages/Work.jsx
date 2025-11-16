import { useState } from "react";
import Topbar from "../components/TopBar";

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const [hasSuggestion] = useState(true); // TODO: Fetch from backend. Button to show suggestion over canvas
  const [showSuggestion, setShowSuggestion] = useState(false);

  const [layers, setLayers] = useState([  //LAYER MANAGEMENT SYSTEM
    { id: 1, name: "Layer 1", active: true }, 
  ]);     //id is the unique identifier for each layer, name is the display name, active indicates if it's the selected layer

  const addLayer = () => {
    setLayers((prev) => {
      const nextId = prev.length ? prev[prev.length - 1].id + 1 : 1;
      return [
        ...prev.map((layers) => ({ ...layers, active: false })),  //deactivate existing layers
        { id: nextId, name: `Layer ${nextId}`, active: true },  //add new active layer
      ];
    });
  };

  const selectLayer = (id) => {
    setLayers((prev) => prev.map((l) => ({ ...l, active: l.id === id })));
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

              <button //show suggestion button
                className="pill ghost"
                disabled={!hasSuggestion}
                onClick={() => hasSuggestion && setShowSuggestion((v) => !v)}
              >
                {showSuggestion ? "Hide suggestion" : "View suggestion"}
              </button>

            </div>
          </header>

          <div className="canvas-toolbar">
            <span className="chip">Brush · Size 6 · #E4572E</span>
          </div>

          {/* Main drawing surface (placeholder black window). */}
          <div
            className="canvas-box flex-1"
            role="img"
            aria-label="Drawing surface (mock)"
          >
            {showSuggestion && (
              <div className="canvas-suggestion-overlay">
                {/* placeholder suggestion view – wire to real preview later */}
                <div className="canvas-suggestion-label">
                  Preview: suggested color fix
                </div>
              </div>
            )}
          </div>
        </section>

        {/* replace with icons laters */}
        <aside
          className="flex flex-col items-center w-16 flex-shrink-0
                     rounded-3xl bg-[var(--panel-2)]
                     shadow-[0_18px_60px_rgba(0,0,0,0.6)] py-3 px-2"
        >
          {/* tools */}
          <div className="flex flex-col gap-2 mb-3">
            <button className="tool-btn tool-btn--active" title="Brush">
              B
            </button>
            <button className="tool-btn" title="Eraser">
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
                  className={`layer-btn ${layer.active ? "layer-btn--active" : ""}`}
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
