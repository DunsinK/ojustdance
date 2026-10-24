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

export type SignalState =
  "searching" | "found" | "connecting" | "failed" | "cancelled";
export function BeatSignal({
  state,
  confirmed,
}: {
  state: SignalState;
  confirmed: boolean;
}) {
  const quiet = useQuietMotion();
  const joined = confirmed && state !== "failed" && state !== "cancelled";
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
        <span>
          {state === "failed" ? "×" : state === "cancelled" ? "—" : "+"}
        </span>
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

/** Articulated, clothed demo avatar. Illustrative poses, not Muse or pose output. */
export function DemoAvatar({
  move,
  rival = false,
}: {
  move: number;
  rival?: boolean;
}) {
  const quiet = useQuietMotion();
  const poses = [
    [-30, 20, -12, 12],
    [135, -145, -8, 8],
    [-65, 65, 8, -8],
    [-55, -90, 18, 25],
    [25, -25, -20, 20],
    [155, 35, -22, 8],
  ];
  const pose = poses[move % poses.length];
  const transition = { duration: quiet ? 0 : 0.38 };
  return (
    <svg
      className={`entry-avatar ${rival ? "entry-avatar-rival" : ""}`}
      viewBox="0 0 300 440"
      aria-hidden="true"
    >
      <ellipse
        cx="150"
        cy="416"
        rx="95"
        ry="7"
        fill="var(--ink)"
        opacity=".22"
      />
      <motion.g
        animate={{ y: move === 4 ? 13 : 0, rotate: move === 3 ? -6 : 0 }}
        transition={transition}
        style={{ transformOrigin: "150px 250px" }}
      >
        <motion.g
          animate={{ rotate: pose[2] }}
          transition={transition}
          style={{ transformOrigin: "130px 248px" }}
        >
          <path
            d="M111 239h40l-8 90-12 73h-34l7-85Z"
            fill="var(--entry-pants)"
          />
          <path d="m96 391 35 3 5 22H77v-12Z" fill="var(--white)" />
        </motion.g>
        <motion.g
          animate={{ rotate: pose[3] }}
          transition={transition}
          style={{ transformOrigin: "170px 248px" }}
        >
          <path
            d="M150 239h39l6 80 10 80h-35l-16-75Z"
            fill="var(--entry-pants)"
          />
          <path d="m171 391 34 1 20 15v9h-56Z" fill="var(--white)" />
        </motion.g>
        <motion.g
          animate={{ rotate: pose[0] }}
          transition={transition}
          style={{ transformOrigin: "115px 141px" }}
        >
          <path d="m104 129-18 50 3 65 23-1 3-60 18-42Z" fill="var(--skin)" />
          <path d="m104 123-16 45 28 12 22-41Z" fill="var(--entry-shirt)" />
          <ellipse cx="101" cy="247" rx="12" ry="15" fill="var(--skin)" />
        </motion.g>
        <motion.g
          animate={{ rotate: pose[1] }}
          transition={transition}
          style={{ transformOrigin: "185px 141px" }}
        >
          <path d="m185 129 26 45 3 68-23 2-6-59-20-42Z" fill="var(--skin)" />
          <path d="m181 122 28 40-25 18-26-41Z" fill="var(--entry-shirt)" />
          <ellipse cx="202" cy="247" rx="12" ry="15" fill="var(--skin)" />
        </motion.g>
        <path
          d="m132 115-27 13 8 62-9 58q45 15 92 0l-9-58 7-62-27-13Z"
          fill="var(--entry-shirt)"
        />
        <path d="M137 95v26q14 12 27 0V95" fill="var(--skin)" />
        <path
          d="M123 60q0-30 28-30t28 30l-4 28q-24 32-48 0Z"
          fill="var(--skin)"
        />
        <path
          d="m121 68-3-26 17-17 30 1 20 17-6 25-15-20-35 13Z"
          fill="var(--ink)"
        />
        <path d="m137 77 6-1m15 0 6-1" stroke="var(--ink)" strokeWidth="3" />
        <path
          d="m133 158 14 14 25-29"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="6"
        />
      </motion.g>
    </svg>
  );
}
