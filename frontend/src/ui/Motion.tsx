import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

export const ReducedMotionContext = createContext(false);
export const useQuietMotion = () => useContext(ReducedMotionContext);

/** Original implementation informed by the 21st.dev Animated Number interaction.
 * One animation owner; cancel/rebase on fast score events. Exact value stays accessible. */
export function AnimatedNumber({
  value,
  reveal = false,
}: {
  value: number;
  reveal?: boolean;
}) {
  const quiet = useQuietMotion();
  const number = useMotionValue(reveal && !quiet ? 0 : value);
  const formatted = useTransform(number, (n) => Math.round(n).toLocaleString());
  useEffect(() => {
    if (quiet) {
      number.set(value);
      return;
    }
    const control = animate(number, value, {
      duration: reveal ? 0.85 : 0.18,
      ease: "easeOut",
    });
    return () => control.stop();
  }, [number, value, quiet, reveal]);
  return (
    <span className="animated-number">
      <span className="sr-only">{value.toLocaleString()}</span>
      <motion.span aria-hidden="true">{formatted}</motion.span>
    </span>
  );
}

/** Once-only, transform/opacity reveal. Content never depends on animation completion. */
export function InView({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const quiet = useQuietMotion();
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={quiet ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.4, delay: quiet ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}
