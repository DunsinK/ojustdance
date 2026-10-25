import { useReducedMotion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { Landing } from "../screens/Landing";
import { ReducedMotionContext } from "../ui/Motion";
import "./Home.css";

export function Home() {
  const navigate = useNavigate();
  const quiet = !!useReducedMotion();

  return (
    <ReducedMotionContext.Provider value={quiet}>
      <div className={`festival-home${quiet ? " motion-reduced" : ""}`}>
        <header className="festival-home-bar">
          <Link to="/" className="festival-home-brand" aria-label="ojustdance home">
            <Brand />
          </Link>
          <nav className="festival-home-nav" aria-label="Primary">
            <Link to="/battle">Battle</Link>
            <Link to="/solo">Solo</Link>
            <Link to="/map">Map</Link>
            <Link to="/charts">Charts</Link>
          </nav>
        </header>

        <Landing
          onFind={() => navigate("/battle")}
          secondary={
            <div className="festival-secondary-ctas">
              <Link to="/solo" className="btn ghost">
                Solo practice
              </Link>
              <Link to="/map" className="btn ghost">
                Map a chart
              </Link>
            </div>
          }
        />

        <footer className="festival-home-foot">
          <span>NO SMALL TALK. JUST DANCE.</span>
          <span>ojustdance / HACKTX 2026</span>
        </footer>
      </div>
    </ReducedMotionContext.Provider>
  );
}
