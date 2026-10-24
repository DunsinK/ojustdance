import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { demoDance } from "../demo/controller";
import { AnimatedNumber, useQuietMotion } from "../ui/Motion";
import { DemoAvatar, MatchButton } from "../components/entry/EntryMotion";

export function Landing({ onFind }: { onFind: () => void }) {
  const quiet = useQuietMotion();
  const [move, setMove] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stage = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!playing || quiet) return;
    const timer = window.setInterval(
      () => setMove((value) => (value + 1) % demoDance.moves.length),
      2000,
    );
    const stop = window.setTimeout(() => setPlaying(false), 12000);
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) setPlaying(false);
    });
    if (stage.current) observer.observe(stage.current);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, quiet]);
  useEffect(() => {
    if (quiet) setPlaying(false);
  }, [quiet]);
  return (
    <div className="entry-landing">
      <section className="entry-hero" aria-labelledby="entry-title">
        <div className="entry-kicker">
          <span>SOCIAL DANCE BATTLES</span>
          <span>HACKTX / VOL. 01</span>
        </div>
        <h1 id="entry-title">
          {["Two strangers.", "One beat."].map((line, i) => (
            <span className="entry-title-line" key={line}>
              <motion.span
                initial={quiet ? false : { y: "100%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.42, delay: i * 0.1 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <div className="entry-invitation">
          <p>
            A random rival. One AI-made routine.
            <br />
            Your room becomes the dance floor.
          </p>
          <MatchButton onClick={onFind} />
        </div>
        <section
          ref={stage}
          className="entry-stage"
          aria-label="Interactive illustrated choreography demo"
        >
          <div className="entry-stage-top">
            <span>
              <i /> INTERACTIVE DEMO
            </span>
            <span>ILLUSTRATED MOVES · NO AUDIO OR CAMERA</span>
          </div>
          <div className="entry-stage-floor">
            <div className="entry-player entry-player-you">
              <span className="entry-player-label">01 / YOU</span>
              <DemoAvatar move={move} />
              <span className="entry-player-foot">YOUR MOVES.</span>
            </div>
            <div className="entry-stage-center">
              <span className="entry-stage-index">
                0<AnimatedNumber value={move + 1} />
                <small>/ 06</small>
              </span>
              <span className="eyebrow">SHARED CHOREOGRAPHY</span>
              <h2>{demoDance.moves[move].name}</h2>
              <div className="entry-beat-marks" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span>
                LEARN THE SAME MOVES.
                <br />
                MAKE THEM YOURS.
              </span>
            </div>
            <div className="entry-player entry-player-rival">
              <span className="entry-player-label">02 / YOUR NEXT RIVAL</span>
              <DemoAvatar move={move} rival />
              <span className="entry-player-foot">ONE RHYTHM.</span>
            </div>
          </div>
          <div className="entry-track-controls">
            <div>
              <strong>{demoDance.title}</strong>
              <span>
                {demoDance.bpm} BPM · {demoDance.difficulty} · Sample routine
              </span>
            </div>
            <button
              className="entry-play"
              onClick={() => {
                if (quiet) setMove((value) => (value + 1) % 6);
                else setPlaying((value) => !value);
              }}
              aria-pressed={quiet ? undefined : playing}
            >
              {quiet
                ? "Next move →"
                : playing
                  ? "Ⅱ Pause demo"
                  : "▶ Play 12s demo"}
            </button>
          </div>
          <div
            className="entry-move-selector"
            role="group"
            aria-label="Explore demo choreography"
          >
            {demoDance.moves.map((item, index) => (
              <button
                key={item.id}
                aria-pressed={move === index}
                onClick={() => {
                  setPlaying(false);
                  setMove(index);
                }}
              >
                <span>0{index + 1}</span>
                {item.name}
              </button>
            ))}
          </div>
        </section>
        <p className="entry-permission">
          No sign-up. No perfect moves required.{" "}
          <span>Your camera stays off until you enable it.</span>
        </p>
      </section>
      <section className="entry-how" id="how-it-works" aria-label="How to play">
        {[
          ["Meet a stranger.", "Skip the profiles. Find a new dance partner."],
          [
            "Catch the routine.",
            "Watch your shared AI choreography for 30 seconds.",
          ],
          [
            "Own the beat.",
            "Dance together. Compete on movement. Run it back.",
          ],
        ].map(([title, body], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="entry-rules" id="ground-rules">
        <strong>GOOD ENERGY ONLY.</strong>
        <p>Make space. Be kind. Leave whenever you want.</p>
        <span aria-hidden="true">↗</span>
      </section>
    </div>
  );
}
