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
  noIssues,
  issueScopes,
  selectedScopes,
  onPrev,
  onNext,
  onClear,
  onSubmit,
  onDelete,
  onSkipUnlabeled,
  onToggleNoIssues,
  onToggleScope,
  isDisabled,
  showDelete,
}) {
  const { MAX_CLICKS } = GRID_CONFIG;
  const canSubmit = !isDisabled && (noIssues || selectedCount === MAX_CLICKS);
  const canSkip = currentIndex < totalImages - 1;
  const scopes = issueScopes || [];
  const activeScopes = selectedScopes || [];

  return (
    <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-700">
      <p className="mb-3 text-sm text-gray-300">
        Selected cells: <span className="text-red-400 font-bold">{selectedCount}/{MAX_CLICKS}</span>
      </p>

      <div className="mb-3 flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={noIssues}
          onChange={onToggleNoIssues}
          className="h-4 w-4"
        />
        <span>No major issues</span>
      </div>

      {scopes.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Issue scope</p>
          <div className="flex gap-2 flex-wrap">
            {scopes.map((scope) => {
              const isSelected = activeScopes.includes(scope);
              const label = scope.charAt(0).toUpperCase() + scope.slice(1);
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => onToggleScope(scope)}
                  className={`px-2 py-1 text-xs rounded border transition ${
                    isSelected
                      ? "bg-blue-700 border-blue-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          Back
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
          Next
        </button>

        <button
          onClick={onSkipUnlabeled}
          disabled={!canSkip}
          className={`px-4 py-2 rounded-lg transition ${
            canSkip
              ? "bg-blue-700 hover:bg-blue-600"
              : "bg-gray-600 cursor-not-allowed opacity-50"
          }`}
        >
          Skip to Unlabeled
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

        {showDelete && (
          <button
            onClick={onDelete}
            className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg transition font-bold"
          >
            Delete My Annotation
          </button>
        )}
      </div>
    </div>
  );
}
