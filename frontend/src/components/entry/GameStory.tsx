import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import type { Choreography, GameRenderers } from "../../types";
import { useQuietMotion } from "../../ui/Motion";
import { Spark } from "../Brand";

const chapters = [
  [
    "Meet",
    "MATCH THROUGH THE SERVER.",
    "Two connected players in the queue are paired into the same room.",
  ],
  [
    "Choose",
    "ONE SHARED SAMPLE CHART.",
    "Both players receive the same test routine from the backend.",
  ],
  [
    "Learn",
    "YOU’VE GOT 30 SECONDS.",
    "Watch the choreography and mark yourself ready before the round starts.",
  ],
  [
    "Dance",
    "CAMERA PREVIEW STAYS LOCAL.",
    "Camera access is optional. This build does not publish video to the other player.",
  ],
  [
    "Scoring",
    "POSE SCORING IS NEXT.",
    "The shared round clock works; scores and a winner wait for pose-scoring integration.",
  ],
];
export function GameStory({
  renderers,
  sampleChart,
}: {
  renderers: GameRenderers;
  sampleChart: Choreography;
}) {
  const quiet = useQuietMotion();
  const track = useRef<HTMLElement>(null);
  const [scrollEnabled, setScrollEnabled] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(
      "(min-width: 601px) and (min-height: 701px)",
    );
    const update = () => setScrollEnabled(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const [chapter, setChapter] = useState(0);
  const [move, setMove] = useState(0);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start start", "end end"],
  });
  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!quiet && scrollEnabled) setChapter(Math.min(4, Math.floor(value * 5)));
  });
  const Stage = renderers.Choreography;
  return (
    <section
      ref={track}
      className={`festival-story ${quiet ? "story-static" : ""}`}
      id="how-it-works"
      aria-labelledby="story-heading"
    >
      <div className="story-sticky">
        <div className="story-heading">
          <span>02 / HOW THIS GOES</span>
          <span>PRODUCT WALKTHROUGH · SAMPLE CHART</span>
        </div>
        <div className="story-composition">
          <div className="story-copy">
            <span className="story-count">
              0{chapter + 1}
              <small>/05</small>
            </span>
            <h2 id="story-heading">{chapters[chapter][1]}</h2>
            <p>{chapters[chapter][2]}</p>
            <p className="story-instruction">
              {scrollEnabled && !quiet
                ? "Scroll to advance, or choose a step below."
                : "Choose a step below to explore the round."}
            </p>
          </div>
          <div className={`story-screen story-screen-${chapter}`}>
            <div className="story-screen-label">
              <span>ojustdance / LOCAL TEST BUILD</span>
              <span>NOT LIVE</span>
            </div>
            {chapter === 0 ? (
              <div className="story-match">
                <motion.div
                  initial={quiet ? false : { x: -45 }}
                  animate={{ x: 0 }}
                >
                  YOU<span>01</span>
                </motion.div>
                <Spark />
                <motion.div
                  initial={quiet ? false : { x: 45 }}
                  animate={{ x: 0 }}
                >
                  PLAYER 02<span>02</span>
                </motion.div>
                <p>Same room. No small talk.</p>
              </div>
            ) : chapter === 1 ? (
              <div className="story-routine">
                <span>SHARED CHOREOGRAPHY</span>
                <strong>{sampleChart.title}</strong>
                <div className="story-score-bars">
                  {sampleChart.moves.map((item, i) => (
                    <motion.div
                      key={item.id}
                      initial={quiet ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <b>0{i + 1}</b>
                      {item.name}
                      <span>{item.durationMs / 1000}s</span>
                    </motion.div>
                  ))}
                </div>
                <p>Sample chart served by the backend · no audio</p>
              </div>
            ) : chapter === 2 ? (
              <div className="story-learn">
                <Stage
                  choreography={sampleChart}
                  elapsedMs={move * 5000}
                  playing={false}
                />
                <button
                  onClick={() =>
                    setMove((value) => (value + 1) % sampleChart.moves.length)
                  }
                >
                  Try next move <span aria-hidden="true">→</span>
                </button>
              </div>
            ) : (
              <div className="story-duel">
                {["YOU", "PLAYER 02"].map((name, i) => (
                  <div key={name} className={i ? "story-rival" : ""}>
                    <span>{name}</span>
                    <strong>—</strong>
                    <div className="story-body-space">
                      <span>
                        {chapter === 4
                          ? "SCORE\nUNAVAILABLE"
                          : "CAMERA\nNOT SHARED"}
                      </span>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <small>
                      {chapter === 4
                        ? "POSE SCORING NOT CONNECTED"
                        : "LOCAL PREVIEW ONLY"}
                    </small>
                  </div>
                ))}
                <p>
                  {chapter === 4
                    ? "No winner is declared until scoring is connected."
                    : `${sampleChart.moves[move].name} → Shared server timer`}
                </p>
              </div>
            )}
          </div>
        </div>
        <nav className="story-chapters" aria-label="Game walkthrough">
          {chapters.map(([label], i) => (
            <button
              key={label}
              aria-pressed={chapter === i}
              onClick={() => setChapter(i)}
            >
              <span>0{i + 1}</span>
              {label}
              <i />
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
