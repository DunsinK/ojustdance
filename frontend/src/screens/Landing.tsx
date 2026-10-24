import { Spark } from "../components/Brand";
import { VideoPanel } from "../components/Stage";
import { MoveQueue, Score } from "../components/GameUI";
import { MoveIcon } from "../components/Performer";
import { Button } from "../ui/Button";
import { InView } from "../ui/Motion";
import { demoDance } from "../demo/controller";
import type { Player } from "../types";
const showcasePlayers: readonly Player[] = [
  {
    id: "showcase-you",
    name: "You",
    color: "cobalt",
    ready: true,
    score: 8240,
  },
  {
    id: "showcase-rival",
    name: "Rival",
    color: "coral",
    ready: true,
    score: 7950,
  },
];
export function Landing({ onFind }: { onFind: () => void }) {
  return (
    <div className="landing">
      <section className="hero-grid">
        <InView className="hero-copy">
          <span className="eyebrow">
            <span className="status-dot" /> STRANGERS IN SYNC. RIVALS IN RHYTHM.
          </span>
          <h1>
            Two strangers.
            <br />
            <em>One beat.</em>
          </h1>
          <p>
            A random rival. An AI-made routine.
            <br />
            Thirty seconds to make it yours.
          </p>
          <Button onClick={onFind} arrow className="hero-cta">
            Find a match
          </Button>
          <div className="hero-footnote">
            <span>No sign-up. No perfect moves required.</span>
            <span>Camera stays off until you say so.</span>
          </div>
        </InView>
        <InView delay={0.12} className="hero-preview">
          <div className="preview-window-bar">
            <span className="eyebrow">
              A LITTLE COMPETITION. A LOT OF ENERGY.
            </span>
            <span className="badge">GAME PREVIEW</span>
          </div>
          <div className="showcase-scores">
            {showcasePlayers.map((p, i) => (
              <Score key={p.id} player={p} local={i === 0} />
            ))}
          </div>
          <div className="showcase-feeds">
            {showcasePlayers.map((p, i) => (
              <VideoPanel key={p.id} player={p} local={i === 0} demo>
                <span>{i === 0 ? "PERFECT" : "GOOD"}</span>
                <span>DEMO</span>
              </VideoPanel>
            ))}
            <span className="showcase-vs">VS</span>
          </div>
          <div className="showcase-lane">
            <div className="mini-coach">
              <MoveIcon index={1} />
              <span>THE TARGET</span>
            </div>
            <MoveQueue dance={demoDance} elapsed={0} compact />
          </div>
          <div className="showcase-footer">
            <span>
              <i /> After Hours / 120 BPM
            </span>
            <span>YOUR NEXT MOVE STARTS HERE ↗</span>
          </div>
        </InView>
      </section>
      <InView className="landing-section" delay={0.08}>
        <div className="section-heading" id="how-it-works">
          <span className="eyebrow">LESS SCROLLING. MORE MOVING.</span>
          <h2>Your room is the dance floor.</h2>
          <p>Three steps. One shared moment.</p>
        </div>
        <div className="feature-grid">
          <article className="feature feature-match">
            <span className="eyebrow">01 / MEET</span>
            <div className="feature-art match-art" aria-hidden="true">
              <span>YOU</span>
              <i />
              <span>?</span>
            </div>
            <h3>Meet your next rival.</h3>
            <p>
              One tap connects you with someone new. Skip the profiles. Find the
              energy.
            </p>
          </article>
          <article className="feature feature-learn">
            <span className="eyebrow">02 / LEARN</span>
            <div className="feature-art moves-art">
              <MoveIcon />
              <MoveIcon index={1} />
              <MoveIcon index={2} />
            </div>
            <h3>Catch the choreography.</h3>
            <p>
              Get the same AI-generated routine. Watch the coach, then make it
              your own.
            </p>
          </article>
          <article className="feature feature-battle">
            <span className="eyebrow">03 / COMPETE</span>
            <div className="feature-art score-art" aria-hidden="true">
              <span>PERFECT</span>
              <strong>
                +240
                <Spark />
              </strong>
            </div>
            <h3>Leave it on the floor.</h3>
            <p>
              Dance in sync. Chase your high score. Run it back with a new
              connection.
            </p>
          </article>
        </div>
      </InView>
      <section className="ground-rules" id="ground-rules">
        <Spark />
        <p>
          <strong>Good moves start with good energy.</strong> Make space. Be
          kind. Leave whenever you want.
        </p>
        <span className="badge">HACKTX / 2026</span>
      </section>
    </div>
  );
}
