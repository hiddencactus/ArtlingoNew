// Imports
import { useState } from "react";
import MetricBar from "../components/MetricBar";
import Topbar from "../components/TopBar";

const TOOL_BTN_BASE = "flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold";
const TOOL_BTN = `${TOOL_BTN_BASE} bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--panel)]/90`;
const TOOL_BTN_ACTIVE = `${TOOL_BTN_BASE} bg-[var(--primary)] text-[var(--primary-ink)] shadow-sm`;

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);

  const [hasSuggestion] = useState(true); // TO-DO: Fetch from backend. Button to show suggestion over canvas
  const [showSuggestion, setShowSuggestion] = useState(false);

  // moved to separate mastery page
  // const mastery = [
  //   // TO-DO: Fetch real mastery data from backend
  //   // Display core data
  //   { label: "L1 Straightness & Planning", value: 76 },
  //   { label: "L2 Speed Control", value: 58 },
  //   { label: "L3 Micro-stability", value: 41 },
  //   { label: "C1 Value Grouping", value: 64 },
  //   { label: "C3 Harmony Awareness", value: 28 },
  //   { label: "C2 Accent Grouping", value: 52 },
  // ];

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
          className="flex flex-col justify-between items-center w-16 flex-shrink-0
                     rounded-3xl bg-[var(--panel-2)]
                     shadow-[0_18px_60px_rgba(0,0,0,0.6)] py-3 px-2"
        >
          {/* painting tools */}
          <div className="flex flex-col gap-2 mb-4">
            <button className={TOOL_BTN_ACTIVE} title="Brush">
              B
            </button>
            <button className={TOOL_BTN} title="Eraser">
              E
            </button>
            <button className={TOOL_BTN} title="Color picker">
              C
            </button>
          </div>

          {/* overlays (harmony, values, etc.) */}
          <div className="flex flex-col gap-2 mb-4">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full
                         bg-[var(--panel)] text-[var(--text)]
                         text-xs font-semibold hover:bg-[var(--panel)]/90"
              title="Toggle harmony overlay"
            >
              H
            </button>
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full
                         bg-[var(--panel)] text-[var(--text)]
                         text-xs font-semibold hover:bg-[var(--panel)]/90"
              title="Toggle value map"
            >
              V
            </button>
          </div>

          {/* layers */}
          <div className="flex flex-col gap-2">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full
                         bg-[var(--panel)] text-[var(--text)]
                         text-xs font-semibold hover:bg-[var(--panel)]/90"
              title="Layers"
            >
              L
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
