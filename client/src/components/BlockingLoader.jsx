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
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative w-[min(520px,92vw)] rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="text-center text-xl font-bold text-gray-900">{text}</div>

        <div className="mt-6 flex justify-center">
          <div className="h-3 w-[min(360px,82vw)] overflow-hidden rounded-full bg-gray-200">
            <div className="h-full w-1/3 animate-[progress_1.1s_infinite] rounded-full bg-gray-900" />
          </div>
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
