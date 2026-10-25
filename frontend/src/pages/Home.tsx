import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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

const exploreSteps = [
  {
    n: "01",
    title: "Hit play",
    body: "Jump into a random battle or warm up solo. Camera stays off until you say so.",
  },
  {
    n: "02",
    title: "Get a routine",
    body: "An AI-mapped chart drops. Thirty seconds. Same beat for you and a stranger.",
  },
  {
    n: "03",
    title: "Make it yours",
    body: "Match the poses, stack your score, leave whenever. No small talk required.",
  },
] as const;

export function Home() {
  const navigate = useNavigate();
  const quiet = !!useReducedMotion();
  const [launching, setLaunching] = useState(false);

  function goPlay() {
    if (launching) return;
    setLaunching(true);
    window.setTimeout(
      () => navigate("/camera-check", { state: { fromPlay: true } }),
      quiet ? 0 : 340,
    );
  }

  return (
    <ReducedMotionContext.Provider value={quiet}>
      <div className={`gate${quiet ? " motion-reduced" : ""}`}>
        <div className="gate-hero">
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

              <motion.button
                type="button"
                className={`gate-play${launching ? " launching" : ""}`}
                onClick={goPlay}
                layoutId={quiet ? undefined : "play-portal"}
                animate={
                  launching && !quiet
                    ? { scale: 1.12, opacity: 0.85 }
                    : { scale: 1, opacity: 1 }
                }
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <span className="gate-play-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.5v13l11-6.5L8 5.5Z" />
                  </svg>
                </span>
                <span className="gate-play-label">
                  {launching ? "OPENING…" : "PLAY NOW"}
                </span>
                <span className="gate-play-arrow" aria-hidden="true">
                  ↗
                </span>
              </motion.button>

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

            <a className="gate-scroll" href="#explore">
              <span aria-hidden="true">↓</span> SCROLL TO EXPLORE
            </a>
          </main>
        </div>

        <section className="gate-explore" id="explore" aria-labelledby="explore-title">
          <div className="gate-explore-inner">
            <p className="gate-explore-kicker">HOW IT GOES</p>
            <h2 id="explore-title">
              THREE STEPS.
              <br />
              <span>ZERO SMALL TALK.</span>
            </h2>
            <p className="gate-explore-lede">
              Drop in, catch a routine, dance it out. Leave whenever you want.
            </p>

            <ol className="gate-explore-steps">
              {exploreSteps.map((step) => (
                <li key={step.n} className="gate-explore-step">
                  <span className="gate-explore-n">{step.n}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="gate-explore-actions">
              <button
                type="button"
                className="gate-play gate-play--compact"
                onClick={goPlay}
              >
                <span className="gate-play-label">ENTER BATTLE</span>
                <span className="gate-play-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
              <Link to="/solo" className="gate-explore-link">
                Solo practice
              </Link>
              <Link to="/map" className="gate-explore-link">
                Map a chart
              </Link>
            </div>
          </div>
        </section>

        <footer className="gate-foot">
          <span>NO SMALL TALK. JUST DANCE.</span>
          <span>ojustdance / HACKTX 2026</span>
        </footer>
      </div>
    </ReducedMotionContext.Provider>
  );
}
