/**
 * RESULTS PANEL
 * 
 * Shows:
 * 1. Image metrics (line straightness, value grouping, harmony)
 * 2. Heatmap visualization (16x16 grid showing where artist clicked)
 * 3. Raw data (hidden by default, for debugging)
 */

import React from "react";
import { GRID_CONFIG } from "../utils/constants";

const formatMetric = (value) => (
  Number.isFinite(value) ? `${Math.round(value)}%` : "N/A"
);

const getLabeledTiles = (resultJson) => {
  const patches = Array.isArray(resultJson?.patches) ? resultJson.patches : [];
  const clicks = Array.isArray(resultJson?.clicks) ? resultJson.clicks : [];

  if (patches.length === 0 || clicks.length === 0) {
    return [];
  }

  const patchById = new Map();
  for (const patch of patches) {
    if (patch && typeof patch.patch_id === "number") {
      patchById.set(patch.patch_id, patch);
    }
  }

  const tiles = [];
  const selectedIds = new Set();
  for (const click of clicks) {
    if (!Array.isArray(click) || click.length < 2) continue;
    const [x, y] = click;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    const col = Math.floor(x / GRID_CONFIG.CELL_SIZE);
    const row = Math.floor(y / GRID_CONFIG.CELL_SIZE);
    if (col < 0 || col >= GRID_CONFIG.SIZE || row < 0 || row >= GRID_CONFIG.SIZE) {
      continue;
    }

    const id = row * GRID_CONFIG.SIZE + col;
    if (selectedIds.has(id)) {
      continue;
    }

    selectedIds.add(id);
    const patch = patchById.get(id) || patches[id];
    tiles.push({
      id,
      row,
      col,
      metrics: patch?.patch_metrics || null,
    });
  }

  return tiles;
};

export default function ResultsPanel({ resultJson }) {
  console.log("ResultsPanel received:", resultJson);
  const labeledTiles = getLabeledTiles(resultJson);

  if (!resultJson) {
    return (
      <p className="text-gray-500 italic">
        👆 Select 3 grid cells and click "Submit Annotation" to analyze...
      </p>
    );
  }

  if (resultJson.error) {
    return (
      <div className="p-4 bg-red-900 border border-red-700 rounded">
        <p className="text-red-300 font-bold">❌ Error</p>
        <p className="text-red-200">{resultJson.message}</p>
      </div>
    );
  }

  if (!resultJson.patches) {
    return (
      <div className="p-4 bg-yellow-900 border border-yellow-700 rounded">
        <p className="text-yellow-300 font-bold">⚠️ No patches received</p>
        <p className="text-yellow-200 text-xs">Response keys: {Object.keys(resultJson).join(", ")}</p>
      </div>
    );
  }

  return (
    <>
      {/* ===== SECTION 1: Image Metrics ===== */}
      <div className="mb-6 p-4 bg-gray-800 rounded border border-gray-700">
        <h4 className="text-green-400 font-bold mb-3">📊 Image Metrics</h4>
        <p className="text-xs text-gray-400 mb-3">
          {labeledTiles.length > 0
            ? "Metrics for selected tiles:"
            : "No labeled tiles selected for metrics."}
        </p>
        {labeledTiles.length > 0 && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-4 text-xs text-gray-400 uppercase tracking-wide">
              <span>Tile</span>
              <span>Line</span>
              <span>Value</span>
              <span>Harmony</span>
            </div>
            {labeledTiles.map((tile, index) => (
              <div key={`${tile.id}-${index}`} className="grid grid-cols-4 items-center">
                <span className="text-gray-300">[{tile.row},{tile.col}]</span>
                <span className="text-yellow-400 font-bold">
                  {formatMetric(tile.metrics?.line)}
                </span>
                <span className="text-yellow-400 font-bold">
                  {formatMetric(tile.metrics?.value)}
                </span>
                <span className="text-yellow-400 font-bold">
                  {formatMetric(tile.metrics?.harmony)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== SECTION 2: Heatmap ===== */}
      <div className="mb-6 p-4 bg-gray-800 rounded border border-gray-700">
        <h4 className="text-green-400 font-bold mb-3">🎨 Interest Heatmap (16×16)</h4>
        <p className="text-xs text-gray-400 mb-3">
          Red = Where you clicked. Brightness = influence (Gaussian blur spread)
        </p>
        {resultJson.blurred_grid && (
          <div
            className="inline-block border-2 border-gray-500"
            style={{ display: "grid", gridTemplateColumns: `repeat(16, 1fr)` }}
          >
            {resultJson.blurred_grid.map((row, i) => (
              <div key={i}>
                {row.map((val, j) => (
                  <div
                    key={`${i}-${j}`}
                    className="w-6 h-6 transition-all hover:scale-110 cursor-pointer"
                    style={{
                      backgroundColor: `rgba(255, 100, 100, ${val})`,
                      border: "1px solid rgba(100, 100, 100, 0.3)",
                      boxShadow:
                        val > 0.5 ? "0 0 4px rgba(255, 100, 100, 0.6)" : "none",
                    }}
                    title={`Cell [${i}][${j}]: ${val.toFixed(3)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== SECTION 3: Raw Data (Hidden) ===== */}
      <details className="text-xs cursor-pointer">
        <summary className="text-gray-400 hover:text-white mb-2 font-bold">
          📋 Show Full Patch Data (Developer)
        </summary>
        <pre className="text-xs overflow-auto max-h-64 bg-black p-3 rounded text-gray-300 border border-gray-700">
          {JSON.stringify(resultJson, null, 2)}
        </pre>
      </details>
    </>
  );
}
