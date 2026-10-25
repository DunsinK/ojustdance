import { useId, useRef, useState } from "react";
import type { GameRenderers } from "../types";
import chartData from "../../../shared/sample-chart.json";
import { ChoreographyStage, VideoPanel } from "../components/Stage";
import { WordmarkIntro } from "../components/entry/WordmarkIntro";
import { GameStory } from "../components/entry/GameStory";

export function PlayMenu({
  onFind,
  onSolo,
  onPractice,
  children = "LET’S DANCE",
}: {
  onFind: () => void;
  onSolo: () => void;
  onPractice: () => void;
  children?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pointerInside = useRef(false);
  const openedFromFocus = useRef(false);

  return (
    <div
      className={`festival-play-menu${isOpen ? " is-open" : ""}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          pointerInside.current = true;
          setIsOpen(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          pointerInside.current = false;
          if (!event.currentTarget.contains(document.activeElement)) {
            setIsOpen(false);
          }
        }
      }}
      onFocusCapture={() => {
        if (!isOpen) {
          openedFromFocus.current = true;
          setIsOpen(true);
        }
      }}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          !(nextTarget instanceof Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          openedFromFocus.current = false;
          setIsOpen(pointerInside.current);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          triggerRef.current?.focus();
          openedFromFocus.current = false;
          setIsOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        className="festival-play"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => {
          if (pointerInside.current || openedFromFocus.current) {
            openedFromFocus.current = false;
            setIsOpen(true);
          } else {
            setIsOpen((open) => !open);
          }
        }}
      >
        <span>{children}</span>
        <span aria-hidden="true">⌃</span>
      </button>
      {isOpen && (
        <div
          className="festival-play-options"
          id={menuId}
          role="group"
          aria-label="Choose a game mode"
        >
          <button type="button" onClick={onFind}>
            <span>Battle</span>
            <span>Find a player</span>
          </button>
          <button type="button" onClick={onSolo}>
            <span>Solo</span>
            <span>Play a chart</span>
          </button>
          <button type="button" onClick={onPractice}>
            <span>Practice</span>
            <span>Map a dance</span>
          </button>
        </div>
      )}
    </div>
  );
}
export function Landing({
  onFind,
  onSolo,
  onPractice,
  renderers = { Video: VideoPanel, Choreography: ChoreographyStage },
}: {
  onFind: () => void;
  onSolo: () => void;
  onPractice: () => void;
  renderers?: GameRenderers;
}) {
  const sampleChart = { ...chartData, difficulty: "Easy" as const };
  return (
    <div className="festival-landing">
      <section className="festival-intro" aria-labelledby="festival-title">
        <div className="festival-topline">
          <span>HACKTX 2026 / DANCE WITH SOMEONE NEW</span>
          <span>CAMERA OFF UNTIL YOU SAY SO</span>
        </div>
        <img
          className="festival-scribble festival-scribble--music"
          src="/brand/scribble-music.png"
          alt=""
          aria-hidden="true"
        />
        <img
          className="festival-scribble festival-scribble--anywhere"
          src="/brand/scribble-anywhere.png"
          alt=""
          aria-hidden="true"
        />
        <div className="festival-hero-card">
          <div className="festival-brand">
            <span className="festival-edition">
              01 / PRESS PLAY ON SOMETHING WEIRD.
            </span>
            <WordmarkIntro />
          </div>
          <div className="festival-intro-bottom">
            <h1 id="festival-title">
              NO SMALL TALK.
              <br />
              <span>JUST DANCE.</span>
            </h1>
            <div>
              <p>
                Find another player. Learn the same sample routine.
                <br />
                The live round runs on the shared server.
              </p>
              <a href="#how-it-works">
                SEE HOW IT GOES <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </div>
        <div className="festival-ticket" aria-hidden="true">
          <span>NO EXPERIENCE REQUIRED</span>
          <span>JUST A LITTLE ROOM TO MOVE</span>
          <span>NO EXPERIENCE REQUIRED</span>
        </div>
      </section>
      <GameStory renderers={renderers} sampleChart={sampleChart} />
      <section className="festival-finale" id="ground-rules">
        <span>03 / THAT’S ENOUGH SCROLLING.</span>
        <h2>
          YOUR
          <br />
          <em>MOVE.</em>
        </h2>
        <PlayMenu
          onFind={onFind}
          onSolo={onSolo}
          onPractice={onPractice}
        />
        <p>Make some room. Be kind. Leave whenever you want.</p>
        <span className="festival-final-note">
          NO SIGN-UP. NO PERFECT MOVES REQUIRED.
        </span>
      </section>
    </div>
  );
}
