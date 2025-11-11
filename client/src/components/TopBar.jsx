import { useState, useRef, useEffect } from "react";

export default function Topbar({ active = "Train", onChange = () => {} }) {
  const tabs = ["Train", "Drill catalog", "Upload"];
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        {/* Artlingo header  */}
        <div className="brand">Artlingo</div>

        {/* tabs centered in .topbar group  in css */}
        <nav
          className="tabs segmented-tabs topbar-group"
          role="tablist"
          aria-label="Main sections"
        >
          {tabs.map((t) => {
            const selected = active === t;
            return (
              <button
                key={t}
                role="tab"
                aria-selected={selected}
                aria-current={selected ? "page" : undefined}
                className={`tab ${selected ? "active" : ""}`}
                type="button"
                onClick={() => onChange(t)}
              >
                <span className="tab-label">{t}</span>
                <span className="tab-ripple" aria-hidden />
              </button>
            );
          })}
        </nav>

        {/* user menu on te right*/}
        <div className="user-menu" ref={menuRef}>
          <button
            className={`user-btn ${menuOpen ? "open" : ""}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Open user menu"
          >
            <div className="avatar" aria-hidden />
            <span className="user-name">User</span>
          </button>

          <div className={`dropdown ${menuOpen ? "show" : ""}`} role="menu">
            <button className="dropdown-item" role="menuitem">
              Settings
            </button>
            <button className="dropdown-item" role="menuitem">
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
