import Topbar from "../components/TopBar";
import MetricBar from "../components/MetricBar";

export default function Mastery({
  activeTab = "Mastery",
  onTabChange = () => {},
}) {
  const mastery = [
    // TODO: Fetch real mastery data from backend
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

      
      <div className="page-body container stack-24">

        {/* Line Metrics moved from Train tab */}
        <section className="panel">
          <header className="panel-head">
            <h2>Line Metrics</h2>
          </header>
          <div className="stack-14">
            <MetricBar label="Straightness" value={82} />
            <MetricBar label="Wobble" value={24} />
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Mastery</h2>
          </header>

          <div className="stack-10">
            {mastery.map((m) => (
              <MetricBar key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
