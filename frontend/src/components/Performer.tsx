/** Original vector stand-ins, never photos or captured frames from the gameplay reference. */
export function Performer({
  rival = false,
  coach = false,
}: {
  rival?: boolean;
  coach?: boolean;
}) {
  return (
    <svg
      className={`performer ${rival ? "rival" : "local"} ${coach ? "coach-figure" : ""}`}
      viewBox="0 0 320 440"
      aria-hidden="true"
    >
      <ellipse cx="162" cy="418" rx="115" ry="12" className="figure-ground" />
      <g className="performer-body">
        <path
          d="m147 240-42 71-31 88 32 10 49-83 39-62Z"
          className="figure-pants"
        />
        <path
          d="m175 245 31 77 51 76 27-20-41-83-29-63Z"
          className="figure-pants"
        />
        <path
          d="m77 393-26 13-11 15 65 1 5-22Z M251 388l7 25 49 4-3-14-29-24Z"
          className="figure-shoes"
        />
        <path
          d="m122 138-41 11-51-65-17 9 46 86 66-7Z"
          className="figure-skin"
        />
        <path
          d="m205 132 37-38 38-57 17 11-33 68-39 51Z"
          className="figure-skin"
        />
        <path
          d="m29 87-4-28-8-6-1 22-11-5-5 7 16 20Z M280 40l3-30 9-3 2 24 12-7 7 8-17 20Z"
          className="figure-skin"
        />
        <path
          d="m145 112-30 13-29 19 17 43 27-6-8 69q54 28 102-5l-14-66 25-14-20-45-36-9Z"
          className="figure-shirt"
        />
        <path d="m154 91-1 27q17 14 28-1l-4-29" className="figure-skin" />
        <path
          d="m140 59q0-29 27-30 34 1 31 31l-5 29q-9 22-29 13l-20-18Z"
          className="figure-skin"
        />
        <path
          d="m140 72-8-24 11-22 32-9 27 19 1 25-18-10-10-12-15 17-18 6Z"
          className="figure-hair"
        />
        <path
          d="m174 68 7-1m-25 4 6-1"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="m164 84 13-2"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m140 151 15 12 27-28"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="5"
        />
        <path
          d="m142 219 54 5m-72 70 20 10m77 14 12-4"
          fill="none"
          stroke="var(--figure-seam)"
          strokeWidth="3"
        />
      </g>
    </svg>
  );
}

const poses = [
  "M35 35 23 51 11 43M41 35 54 45 66 35M37 55 25 76M40 55 53 76",
  "M34 35 23 22 18 9M43 35 55 22 60 9M37 55 26 76M41 55 52 76",
  "M34 34 52 45 26 48M44 34 27 43 53 50M36 56 28 76M42 56 51 76",
  "M34 35 21 44 10 35M43 35 57 30 68 20M37 55 22 73M42 55 56 73",
  "M34 35 23 43 16 35M43 35 54 43 61 35M36 55 24 66 34 77M42 55 54 66 45 77",
  "M34 35 20 25 12 10M43 35 57 46 68 38M37 55 26 76M42 55 53 76",
];
export function MoveIcon({ index = 0 }: { index?: number }) {
  return (
    <svg className="move-icon" viewBox="0 0 80 88" aria-hidden="true">
      <circle cx="39" cy="19" r="8" fill="currentColor" />
      <path
        d="M38 33v23"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={poses[index % poses.length]}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
