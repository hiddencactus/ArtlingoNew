/**
 * CONTROL PANEL
 * 
 * Navigation buttons (Back, Next, Clear) and submission button.
 * Submit is disabled until exactly 3 cells are selected.
 */

import React from "react";
import { GRID_CONFIG } from "../utils/constants";

export default function ControlPanel({
  currentIndex,
  totalImages,
  selectedCount,
  onPrev,
  onNext,
  onClear,
  onSubmit,
  isDisabled,
}) {
  const { MAX_CLICKS } = GRID_CONFIG;
  const canSubmit = selectedCount === MAX_CLICKS && !isDisabled;

  return (
    <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
      <p className="mb-3 text-sm text-gray-300">
        Selected cells: <span className="text-red-400 font-bold">{selectedCount}/{MAX_CLICKS}</span>
      </p>

      <div className="flex gap-3 flex-wrap">
        {/* Navigation */}
        <button
          onClick={onPrev}
          disabled={currentIndex === 0}
          className={`px-4 py-2 rounded-lg transition ${
            currentIndex === 0
              ? "bg-gray-600 cursor-not-allowed opacity-50"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          ← Back
        </button>

        <button
          onClick={onNext}
          disabled={currentIndex === totalImages - 1}
          className={`px-4 py-2 rounded-lg transition ${
            currentIndex === totalImages - 1
              ? "bg-gray-600 cursor-not-allowed opacity-50"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          Next →
        </button>

        {/* Clear selection */}
        <button
          onClick={onClear}
          className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 rounded-lg transition"
        >
          Clear
        </button>

        {/* Submit annotation */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`px-4 py-2 rounded-lg transition font-bold ${
            canSubmit
              ? "bg-green-600 hover:bg-green-500 cursor-pointer"
              : "bg-gray-600 cursor-not-allowed opacity-50"
          }`}
        >
          Submit Annotation
        </button>
      </div>
    </div>
  );
}
