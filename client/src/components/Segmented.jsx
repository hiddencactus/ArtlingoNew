/*The buttons for short/medium/long can be reused for similar buttons elsewhere*/

export default function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`seg-btn ${value === opt ? "sel" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
