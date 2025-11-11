import Topbar from "../components/TopBar";

/**
 * Blank page
 * Temporary placeholder for future pages. Copy and modify as needed.
 */
export default function Blank({
  title = "Blank",
  activeTab = title,
  onTabChange = () => {},
}) {
  return (
    <div className="page">
      <Topbar active={activeTab} onChange={onTabChange} />
      <div className="page-body container">
        <div className="blank-hero">
          <h1>{title}</h1>
          <p>Bingo bongo</p>
        </div>
      </div>
    </div>
  );
}
