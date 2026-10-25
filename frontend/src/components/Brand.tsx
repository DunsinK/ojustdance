/** Supplied wordmark used unaltered, including its original proportions and colors. */
export function Brand() {
  return (
    <img
      className="brand"
      src="/brand/ojustdance-wordmark.png"
      alt="ojustdance"
      width="2048"
      height="683"
    />
  );
}
export function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
export function Spark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 80"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M40 0C44 30 50 36 80 40 50 44 44 50 40 80 36 50 30 44 0 40 30 36 36 30 40 0Z" />
    </svg>
  );
}
