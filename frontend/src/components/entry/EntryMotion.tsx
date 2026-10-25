import { useState } from "react";
import { motion } from "motion/react";
import { useQuietMotion } from "../../ui/Motion";

/** Original magnetic interaction: the hit target never moves. */
export function MatchButton({ onClick }: { onClick: () => void }) {
  const quiet = useQuietMotion();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  return (
    <button
      className="entry-match-button"
      onClick={onClick}
      onPointerMove={(event) => {
        if (quiet || event.pointerType !== "mouse") return;
        const box = event.currentTarget.getBoundingClientRect();
        setOffset({
          x: (event.clientX - box.left - box.width / 2) * 0.035,
          y: (event.clientY - box.top - box.height / 2) * 0.1,
        });
      }}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
      onBlur={() => setOffset({ x: 0, y: 0 })}
    >
      <motion.span
        animate={quiet ? { x: 0, y: 0 } : offset}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
      >
        Find a match <span aria-hidden="true">↗</span>
      </motion.span>
    </button>
  );
}

export type SignalState = "searching" | "found" | "connecting" | "failed";

export function BeatSignal({
  state,
  confirmed,
}: {
  state: SignalState;
  confirmed: boolean;
}) {
  const quiet = useQuietMotion();
  const joined = confirmed && state !== "failed";
  return (
    <div
      className={`beat-signal signal-${state} ${joined ? "signal-joined" : ""}`}
      aria-hidden="true"
    >
      <div className="signal-axis" />
      <motion.div
        className="signal-node signal-you"
        initial={quiet ? false : { opacity: 0, x: "-30%" }}
        animate={{ opacity: 1, x: joined ? "54%" : "0%" }}
        transition={{ duration: quiet ? 0 : 0.4 }}
      >
        <span>YOU</span>
        <b>01</b>
      </motion.div>
      <div className="signal-center">
        <span>{state === "failed" ? "×" : "+"}</span>
      </div>
      <motion.div
        className="signal-node signal-rival"
        initial={quiet ? false : { opacity: 0, x: "30%" }}
        animate={{ opacity: 1, x: joined ? "-54%" : "0%" }}
        transition={{ duration: quiet ? 0 : 0.4 }}
      >
        <span>{confirmed ? "RIVAL" : "UNKNOWN"}</span>
        <b>{confirmed ? "02" : "?"}</b>
      </motion.div>
      <div className="signal-caption">
        <span>YOUR FREQUENCY</span>
        <span>{joined ? "ONE SHARED BEAT" : "OPEN FREQUENCY"}</span>
      </div>
    </div>
  );
}
