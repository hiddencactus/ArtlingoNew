// src/components/BlockingLoader.jsx
import React from "react";

export default function BlockingLoader({ open, text = "Analyzing your artwork..." }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      aria-live="polite"
      aria-busy="true"
    >
      {/* gray overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* modal */}
      <div className="relative w-[min(520px,92vw)] rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-lg font-semibold">{text}</div>
        <div className="mt-2 text-sm text-gray-600">
          This can take a few seconds. Please don’t close the page.
        </div>

        {/* indeterminate progress bar */}
        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div className="h-full w-1/3 animate-[progress_1.1s_infinite] rounded-full bg-gray-900" />
        </div>

        <style>
          {`
            @keyframes progress {
              0% { transform: translateX(-120%); }
              100% { transform: translateX(360%); }
            }
          `}
        </style>
      </div>
    </div>
  );
}