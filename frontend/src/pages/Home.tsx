import { useReducedMotion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { ReducedMotionContext } from "../ui/Motion";
import "./Home.css";

const modes = [
  {
    to: "/solo",
    title: "Solo",
    blurb: "Dance at your own pace.",
    tone: "solo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="7" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M5.5 20c1.4-3.4 3.6-5 6.5-5s5.1 1.6 6.5 5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: "/battle",
    title: "Battle",
    blurb: "Go head-to-head.",
    tone: "battle",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="16" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M3.5 19c1-2.6 2.6-3.8 4.5-3.8S11 16.4 12 19M12 19c1-2.6 2.6-3.8 4.5-3.8S19.5 16.4 20.5 19"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: "/map",
    title: "Practice",
    blurb: "Improve and perfect.",
    tone: "practice",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 18V10M10 18V6M15 18v-5M20 18V8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
] as const;

const stats = [
  { value: "30s", label: "Rounds" },
  { value: "AI", label: "Routines" },
  { value: "0", label: "Sign-up" },
] as const;

export function Home() {
  const navigate = useNavigate();
  const quiet = !!useReducedMotion();

  return (
    <ReducedMotionContext.Provider value={quiet}>
      <div className={`gate${quiet ? " motion-reduced" : ""}`}>
        <div className="gate-stage" aria-hidden="true">
          <div className="gate-stage-wash" />
          <div className="gate-stage-floor" />
          <div className="gate-stage-beams" />
          <img
            className="gate-scribble gate-scribble--left"
            src="/brand/scribble-music.png"
            alt=""
            width="420"
            height="640"
          />
          <img
            className="gate-scribble gate-scribble--right"
            src="/brand/scribble-anywhere.png"
            alt=""
            width="420"
            height="520"
          />
        </div>

        <header className="gate-bar">
          <Link to="/" className="gate-bar-brand" aria-label="ojustdance home">
            <Brand variant="logo" />
          </Link>
          <nav className="gate-nav" aria-label="Primary">
            <Link to="/" aria-current="page">
              Home
            </Link>
            <Link to="/charts">Charts</Link>
            <Link to="/battle">Battle</Link>
            <Link to="/solo">Solo</Link>
            <Link to="/map">Map</Link>
          </nav>
        </header>

        <main className="gate-main">
          <section className="gate-glass" aria-labelledby="gate-title">
            <Brand variant="logo" className="gate-hero-brand" />

            <h1 id="gate-title">
              NO SMALL TALK.
              <br />
              <span>JUST DANCE.</span>
            </h1>

            <p className="gate-lede">
              A stranger. An AI-made routine. Thirty seconds to make it yours.
            </p>

            <button
              type="button"
              className="gate-play"
              onClick={() => navigate("/battle")}
            >
              <span className="gate-play-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5L8 5.5Z" />
                </svg>
              </span>
              <span className="gate-play-label">PLAY NOW</span>
              <span className="gate-play-arrow" aria-hidden="true">
                ↗
              </span>
            </button>

            <div className="gate-modes" role="list">
              {modes.map((mode) => (
                <Link
                  key={mode.to}
                  to={mode.to}
                  className={`gate-mode gate-mode--${mode.tone}`}
                  role="listitem"
                >
                  <span className="gate-mode-icon">{mode.icon}</span>
                  <span className="gate-mode-copy">
                    <strong>{mode.title}</strong>
                    <span>{mode.blurb}</span>
                  </span>
                </Link>
              ))}
            </div>

            <dl className="gate-stats">
              {stats.map((stat) => (
                <div key={stat.label} className="gate-stat">
                  <dt>{stat.value}</dt>
                  <dd>{stat.label}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="gate-scroll">
            <span aria-hidden="true">↓</span> SCROLL TO EXPLORE
          </p>
        </main>
      </div>
    </ReducedMotionContext.Provider>
  );
}
