/** Brand marks. Prefer `logo` (transparent-friendly asset) on dark surfaces. */
export function Brand({
  variant = "logo",
  className = "",
}: {
  variant?: "logo" | "wordmark" | "icon";
  className?: string;
}) {
  const src =
    variant === "icon"
      ? "/brand/ojustdance-icon.png"
      : variant === "wordmark"
        ? "/brand/ojustdance-wordmark.png"
        : "/brand/ojustdance-logo.png";

  return (
    <img
      className={`brand brand--${variant}${className ? ` ${className}` : ""}`}
      src={src}
      alt="ojustdance"
      width={variant === "icon" ? 512 : 2048}
      height={variant === "icon" ? 512 : 683}
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
