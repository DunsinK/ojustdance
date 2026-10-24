export function Star({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M50 0 61 30 85 15 70 39 100 50 70 61 85 85 61 70 50 100 39 70 15 85 30 61 0 50 30 39 15 15 39 30Z" />
    </svg>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <Star />
      shared beat
    </span>
  );
}
export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
export function Dancer({
  variant = "cobalt",
  pose = 0,
}: {
  variant?: "cobalt" | "coral";
  pose?: number;
}) {
  return (
    <svg
      className={`dancer ${variant} pose-${pose % 2}`}
      viewBox="0 0 240 340"
      fill="none"
      aria-hidden="true"
    >
      <ellipse className="dancer-shadow" cx="120" cy="317" rx="78" ry="10" />
      <g className="figure">
        <circle cx="127" cy="53" r="25" fill="currentColor" />
        <path
          d="m115 100 32 62-33 64"
          stroke="currentColor"
          strokeWidth="46"
          strokeLinecap="round"
        />
        <path
          d="m113 107-49 36-31-42M137 112l43-35 20-47"
          stroke="currentColor"
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m117 211-39 46-23 48m69-92 40 40 28 52"
          stroke="currentColor"
          strokeWidth="29"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="m105 145 39-10" stroke="var(--ink)" strokeWidth="5" />
        <path
          d="m125 49 10 2"
          stroke="var(--ink)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
