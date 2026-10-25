import type { ReactNode } from "react";
import type { GameRenderers } from "../types";
import { ChoreographyStage, VideoPanel } from "../components/Stage";
import { WordmarkIntro } from "../components/entry/WordmarkIntro";
import { GameStory } from "../components/entry/GameStory";

export function PlayButton({
  onClick,
  children = "LET’S DANCE",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button className="festival-play" onClick={onClick}>
      <span>{children}</span>
      <span aria-hidden="true">↗</span>
    </button>
  );
}
export function Landing({
  onFind,
  renderers = { Video: VideoPanel, Choreography: ChoreographyStage },
  secondary,
}: {
  onFind: () => void;
  renderers?: GameRenderers;
  secondary?: ReactNode;
}) {
  return (
    <div className="festival-landing">
      <div className="festival-persistent">
        <PlayButton onClick={onFind}>PLAY NOW</PlayButton>
        {secondary}
      </div>
      <section className="festival-intro" aria-labelledby="festival-title">
        <div className="festival-topline">
          <span>HACKTX 2026 / DANCE WITH SOMEONE NEW</span>
          <span>CAMERA OFF UNTIL YOU SAY SO</span>
        </div>
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
              A stranger. An AI-made routine.
              <br />
              Thirty seconds to make it yours.
            </p>
            <a href="#how-it-works">
              SEE HOW IT GOES <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="festival-ticket" aria-hidden="true">
          <span>NO EXPERIENCE REQUIRED</span>
          <span>JUST A LITTLE ROOM TO MOVE</span>
          <span>NO EXPERIENCE REQUIRED</span>
        </div>
      </section>
      <GameStory renderers={renderers} />
      <section className="festival-finale" id="ground-rules">
        <span>03 / THAT’S ENOUGH SCROLLING.</span>
        <h2>
          YOUR
          <br />
          <em>MOVE.</em>
        </h2>
        <PlayButton onClick={onFind} />
        {secondary}
        <p>Make some room. Be kind. Leave whenever you want.</p>
        <span className="festival-final-note">
          NO SIGN-UP. NO PERFECT MOVES REQUIRED.
        </span>
      </section>
    </div>
  );
}
