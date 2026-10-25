import { useId } from "react";
import { motion } from "motion/react";
import { useQuietMotion } from "../../ui/Motion";

export function WordmarkIntro({ className = "" }: { className?: string }) {
  const quiet = useQuietMotion();
  const id = useId();
  return (
    <svg
      className={`festival-wordmark${className ? ` ${className}` : ""}`}
      viewBox="100 120 1900 400"
      role="img"
      aria-label="ojustdance"
    >
      <defs>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <motion.rect
            x="100"
            y="120"
            height="400"
            initial={quiet ? false : { width: 0 }}
            animate={{ width: 1900 }}
            transition={{
              duration: quiet ? 0 : 1.15,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </clipPath>
      </defs>
      <image
        href="/brand/ojustdance-logo.png"
        width="2048"
        height="683"
        clipPath={`url(#${id})`}
      />
    </svg>
  );
}
