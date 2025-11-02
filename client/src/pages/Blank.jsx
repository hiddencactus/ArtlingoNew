import Topbar from "../components/TopBar";

/**
 * Blank page 
 * Use for planning new pages. can just copy paste it
 */
export default function Blank({ title = "Blank", activeTab = title, onTabChange = () => {} }) {
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
