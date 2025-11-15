// Imports
import { useState } from "react";
import Segmented from "../components/Segmented";
import MetricBar from "../components/MetricBar";
import Topbar from "../components/TopBar";

export default function Work({ activeTab = "Train", onTabChange = () => {} }) {
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [length, setLength] = useState("Medium");
  const [reps, setReps] = useState(50);

  const mastery = [
    // TO-DO: Fetch real mastery data from backend
    // Display core data
    { label: "L1 Straightness & Planning", value: 76 },
    { label: "L2 Speed Control", value: 58 },
    { label: "L3 Micro-stability", value: 41 },
    { label: "C1 Value Grouping", value: 64 },
    { label: "C3 Harmony Awareness", value: 28 },
    { label: "C2 Accent Grouping", value: 52 },
  ];

  return (
    <div className="page">
      <Topbar active={activeTab} onChange={onTabChange} />
      <div className="page-body container grid-2">
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

        {/*  Mastery bars and the drills section */}
        <section className="col-right">
          <div className="panel">
            <header className="panel-head">
              <h2>Recommended Drill</h2>
            </header>

            <div className="form-grid">
              <div className="form-row">
                <label>Length</label>
                <Segmented
                  options={["Short", "Medium", "Long"]}
                  value={length}
                  onChange={setLength}
                />
              </div>

              <div className="form-row">
                <label>Repetitions</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={reps}
                  onChange={(e) => setReps(parseInt(e.target.value || "0", 10))}
                />
              </div>
            </div>

            <button className="cta" onClick={() => {}}>
              Start Now
            </button>
          </div>

          <div className="panel">
            <header className="panel-head">
              <h2>Mastery</h2>
            </header>

            <div className="stack-10">
              {mastery.map((m) => (
                <MetricBar key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
