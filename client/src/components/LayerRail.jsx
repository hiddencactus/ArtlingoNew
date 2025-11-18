import React from "react";

export default function LayerRail({ layers, activeLayerId, selectLayer, addLayer, toggleVisibility }) {
  return (
    <aside className="flex flex-col items-center w-16 flex-shrink-0 rounded-3xl bg-[var(--panel-2)] py-3 px-2">
      <div className="flex flex-col gap-2 mb-3">
        <button className="tool-btn">B</button>
        <button className="tool-btn">E</button>
        <button className="tool-btn">C</button>
      </div>

      <div className="h-px w-8 bg-black/40 mb-3" />

      <div className="flex flex-col items-center gap-2 w-full">
        <span className="text-[9px] tracking-wide uppercase text-[var(--muted)]">Layers</span>
        <div className="flex flex-col gap-1 w-full items-center">
          {layers.map((layer) => (
            <div key={layer.id} className="flex items-center gap-1">
              <button
                className={`layer-btn ${layer.id === activeLayerId ? "layer-btn--active" : ""}`}
                onClick={() => selectLayer(layer.id)}
                title={layer.name}
              >
                {layer.name.replace("Layer ", "L")}
              </button>
              <button className="text-xs" onClick={() => toggleVisibility(layer.id)} title="Toggle visibility">
                {layer.visible ? "👁" : "🚫"}
              </button>
            </div>
          ))}

          <button type="button" onClick={addLayer} className="layer-btn text-lg leading-none" title="Add layer">+</button>
        </div>
      </div>
    </aside>
  );
}
