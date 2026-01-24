/**
 * RESULTS PANEL
 * 
 * Shows:
 * 1. Image metrics (line straightness, value grouping, harmony)
 * 2. Heatmap visualization (16x16 grid showing where artist clicked)
 * 3. Raw data (hidden by default, for debugging)
 */

import React from "react";

export default function ResultsPanel({ resultJson }) {
  console.log("ResultsPanel received:", resultJson);

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
          Quality analysis of the labeled area:
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-300">Line Straightness:</span>
            <span className="text-yellow-400 font-bold">
              {resultJson.patches[0]?.patch_metrics?.line || 0}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Value Grouping:</span>
            <span className="text-yellow-400 font-bold">
              {resultJson.patches[0]?.patch_metrics?.value || 0}%
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-300">Overall Harmony:</span>
            <span className="text-yellow-400 font-bold">
              {resultJson.patches[0]?.patch_metrics?.harmony || 0}%
            </span>
          </div>
        </div>
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
