import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { useQuietMotion } from "../../ui/Motion";

let hasPlayed = false;
// Reveal guides follow the supplied raster lettering. They are masks, not a replacement logo.
const guides = [
  "M374 296a53 51 0 1 0 1 0",
  "M498 239v3 M498 300v105q0 50-45 46",
  "M559 299v58q0 40 55 40t55-40v-58",
  "M804 299h-54q-30 0-30 29t57 24q45 0 45 24t-100 20",
  "M888 253v101q0 45 48 40 M854 300h80",
  "M1096 235v160 M1090 334q-35-65-95-13t35 75q50 0 60-62",
  "M1261 300v96 M1255 330q-40-60-88-8t30 74q53 0 58-66",
  "M1316 395v-63q0-35 46-35t42 35v63",
  "M1542 306q-74-40-78 40t76 43",
  "M1581 344h100q-8-64-69-43t-25 82q35 30 81 4",
  "M1440 263h386 M1759 165l-28 190",
];
export function WordmarkIntro() {
  const quiet = useQuietMotion();
  const [skip] = useState(hasPlayed);
  const id = useId();
  useEffect(() => {
    hasPlayed = true;
  }, []);
  return (
    <svg
      className="festival-wordmark"
      viewBox="220 120 1650 390"
      role="img"
      aria-label="ojustdance"
    >
      <defs>
        <mask
          id={id}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="2048"
          height="683"
        >
          <g
            fill="none"
            stroke="white"
            strokeWidth="85"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {guides.map((d, i) => (
              <motion.path
                key={d}
                d={d}
                initial={{ pathLength: quiet || skip ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: 0.45,
                  delay: quiet || skip ? 0 : i * 0.075,
                  ease: "easeOut",
                }}
              />
            ))}
          </g>
        </mask>
      </defs>
      <image
        href="/brand/ojustdance-wordmark-transparent.png"
        width="2048"
        height="683"
        mask={`url(#${id})`}
      />
      <motion.image
        href="/brand/ojustdance-wordmark-transparent.png"
        width="2048"
        height="683"
        initial={{ opacity: quiet || skip ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: quiet || skip ? 0 : 1.25 }}
      />
    </svg>
  );
}
