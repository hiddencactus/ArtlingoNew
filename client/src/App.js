import { useState, useMemo } from "react";
import "./styles/globals.css";
import Work from "./pages/Work";
import Blank from "./pages/Blank";
import Mastery from "./pages/Mastery";

const TAB_ORDER = ["Train", "Mastery", "Upload"];

export default function App() {
  const [tab, setTab] = useState("Train");
  const [direction, setDirection] = useState("right");

  const handleTabChange = (next) => {
    if (next === tab) return;
    const cur = TAB_ORDER.indexOf(tab);
    const nxt = TAB_ORDER.indexOf(next);
    setDirection(nxt > cur ? "right" : "left");
    setTab(next);
  };

  // a key that changes with tab so the sliding animation retriggers
  const viewKey = useMemo(() => `view-${tab}`, [tab]);

  return (
    <div className="app-root">
      {tab === "Train" && (
        <div key={viewKey} className={`view view-slide-${direction}`}>
          <Work activeTab={tab} onTabChange={handleTabChange} />
        </div>
      )}
      {tab === "Mastery" && (
        <div key={viewKey} className={`view view-slide-${direction}`}>
          <Mastery activeTab={tab} onTabChange={handleTabChange} />
        </div>
      )}
      {tab === "Upload" && (
        <div key={viewKey} className={`view view-slide-${direction}`}>
          <Blank title="Upload" activeTab={tab} onTabChange={handleTabChange} />
        </div>
      )}
    </div>
  );
}
