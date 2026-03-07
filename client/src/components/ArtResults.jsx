// src/components/ArtResults.jsx
import React from "react";

function scoreLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Okay";
  return "Needs work";
}

function Bar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="mt-2 h-3 w-full rounded-full bg-gray-200 overflow-hidden">
      <div className="h-full rounded-full bg-gray-900" style={{ width: `${v}%` }} />
    </div>
  );
}

function MetricRow({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-gray-700">
          <span className="font-semibold">{value}</span>/100 · {scoreLabel(value)}
        </div>
      </div>
      {subtitle ? <div className="mt-1 text-sm text-gray-600">{subtitle}</div> : null}
      <Bar value={value} />
    </div>
  );
}

export default function ArtResults({ result }) {
  if (!result?.success) return null;

  const line = result?.metrics?.line ?? 0;
  const value = result?.metrics?.value ?? 0;
  const harmony = result?.metrics?.harmony ?? 0;

  
  const overall = Math.round((line + value + harmony) / 3);

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-bold">Your Results</div>
          <div className="mt-1 text-sm text-gray-600">
            Here’s a quick breakdown — no technical stuff.
          </div>
        </div>

        <div className="rounded-2xl bg-gray-900 px-4 py-3 text-white">
          <div className="text-xs uppercase tracking-wide opacity-80">Overall</div>
          <div className="text-2xl font-bold">{overall}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MetricRow
          title="Line Quality"
          value={line}
          subtitle="Are your edges confident and clean?"
        />
        <MetricRow
          title="Values (Light / Dark)"
          value={value}
          subtitle="Is there good contrast and depth?"
        />
        <MetricRow
          title="Color Harmony"
          value={harmony}
          subtitle="Do the colors feel like they belong together?"
        />
      </div>
    </div>
  );
}