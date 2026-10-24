import { NavLink, Outlet } from "react-router-dom";
import "./Layout.css";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/battle", label: "Battle" },
  { to: "/solo", label: "Solo" },
  { to: "/map", label: "Map" },
  { to: "/charts", label: "Charts" },
  { to: "/api-test", label: "API" },
];

export function Layout() {
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="wordmark" end>
          ojustdance
        </NavLink>
        <nav className="nav" aria-label="Primary">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
