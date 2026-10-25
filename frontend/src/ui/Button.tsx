import type { ButtonHTMLAttributes } from "react";
import { Arrow } from "../components/Brand";
/** Original keyboard-equivalent hover treatment inspired by the 21st.dev CTA reference. */
export function Button({
  children,
  variant = "primary",
  arrow = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  arrow?: boolean;
}) {
  return (
    <button {...props} className={`button ${variant} ${className}`}>
      <span className="button-label">{children}</span>
      {arrow && (
        <span className="button-arrow">
          <Arrow />
        </span>
      )}
    </button>
  );
}
