import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Brand } from "./Brand";
import "./ModeShell.css";

export function ModeShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <div className="mode-shell">
      <a className="mode-skip-link" href="#mode-content">
        Skip to content
      </a>
      <header className="mode-header">
        <Link to="/" className="mode-brand" aria-label="ojustdance home">
          <Brand />
        </Link>
        <nav aria-label="Game modes">
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/battle">Battle</NavLink>
          <NavLink to="/solo">Solo</NavLink>
          <NavLink to="/map">Practice</NavLink>
        </nav>
      </header>
      <div className="mode-content" id="mode-content" tabIndex={-1}>
        {children}
      </div>
      <footer className="mode-footer">
        <span>NO SMALL TALK. JUST DANCE.</span>
        <span>ojustdance / HACKTX 2026</span>
      </footer>
    </div>
  );
}
