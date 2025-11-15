export default function MetricBar({ label, value }) {
  return (
    <div className="metricbar">
      <div className="metricbar-label">
        <span>{label}</span>
        <span className="metricbar-val">{value}%</span>
      </div>
      <div className="metricbar-track">
        <div className="metricbar-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
