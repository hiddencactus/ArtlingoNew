// Imports
import { useState } from "react";
import Segmented from "../components/Segmented";
import MetricBar from "../components/MetricBar";
import Topbar from "../components/TopBar";

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [length, setLength] = useState("Medium");
  const [reps, setReps] = useState(50);

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
    <div className="page">
      <Topbar active={activeTab} onChange={onTabChange} />
      <div className="page-body container grid-rail">
        {/* Training Canvas */}
        <section className="panel">
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
              <button className="pill ghost" onClick={() => {}}>
                Start drill
              </button>
            </div>
          </header>

          <div className="canvas-toolbar">
            <span className="chip">Brush · Size 6 · #E4572E</span>
          </div>

          {/* Main drawing surface (placeholder black window ) . We can add the functionality and stuff later*/}
          <div
            className="canvas-box"
            role="img"
            aria-label="Drawing surface (mock)"
          ></div>

          {/* Line Metrics as bars */}
          <div className="subpanel subpanel-roomy">
            <h3>Line Metrics</h3>
            <div className="stack-14">
              <MetricBar label="Straightness" value={82} />
              <MetricBar label="Wobble" value={24} />
            </div>
          </div>
        </section>

       <aside className="tool-rail">
          {/* painting tools */}
          <div className="tool-rail-group">
            <button className="tool-btn active" title="Brush">
              B
            </button>
            <button className="tool-btn" title="Eraser">
              E
            </button>
            <button className="tool-btn" title="Color picker">
              C
            </button>
          </div>

          {/* overlays (harmony, values, etc.) */}
          <div className="tool-rail-group">
            <button className="tool-btn" title="Toggle harmony overlay">
              H
            </button>
            <button className="tool-btn" title="Toggle value map">
              V
            </button>
          </div>

          {/* layers */}
          <div className="tool-rail-group">
            <button className="tool-btn" title="Layers">
              L
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
