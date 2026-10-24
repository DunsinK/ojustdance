import type { KeyboardEvent, MouseEvent } from "react";
import type { TimelineSegment } from "../pose/types";
import "./Timeline.css";

type Props = {
  segments: TimelineSegment[];
  playheadSec: number;
  durationSec: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onScrub: (sec: number) => void;
};

function formatTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

export function Timeline({
  segments,
  playheadSec,
  durationSec,
  selectedId,
  onSelect,
  onScrub,
}: Props) {
  const span = Math.max(durationSec, playheadSec, 4);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    onScrub((x / rect.width) * span);
    onSelect(null);
  }

  return (
    <div className="timeline">
      <div className="timeline-meta">
        <span>Timeline</span>
        <span>{formatTime(playheadSec)} / {formatTime(span)}</span>
      </div>
      <div
        className="timeline-track"
        onClick={handleClick}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={span}
        aria-valuenow={playheadSec}
        aria-label="Playhead"
        tabIndex={0}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "ArrowLeft") onScrub(Math.max(0, playheadSec - 0.25));
          if (e.key === "ArrowRight") onScrub(playheadSec + 0.25);
        }}
      >
        <div className="timeline-ruler" aria-hidden="true" />
        {segments.map((seg) => {
          const left = (seg.startSec / span) * 100;
          const width = (Math.max(0.05, seg.endSec - seg.startSec) / span) * 100;
          return (
            <button
              key={seg.id}
              type="button"
              className={
                selectedId === seg.id ? "timeline-clip selected" : "timeline-clip"
              }
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${formatTime(seg.startSec)} – ${formatTime(seg.endSec)}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(seg.id);
                onScrub(seg.startSec);
              }}
            />
          );
        })}
        <div
          className="timeline-playhead"
          style={{ left: `${(playheadSec / span) * 100}%` }}
          aria-hidden="true"
        />
      </div>
      {!segments.length && (
        <p className="timeline-empty">No clips yet — hit Record to capture a take.</p>
      )}
    </div>
  );
}
