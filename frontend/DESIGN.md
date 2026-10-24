# ojustdance — redesign system

## Art direction

A competitive rhythm-game floor, framed like an independent music release. Near-black canvas, flat charcoal panels, large lime/coral score numerals, concise uppercase labels, and a tight collection of circular records, intersecting orbits and directional cues. The real supplied wordmark is the primary identity. The previous blue/coral Shared Beat identity has been replaced.

The ui-ux-pro-max gaming recommendations informed an immersive game stage, clear hierarchy and controlled motion. Its suggested purple palette, hyperrealism and complex effects were overridden by the supplied brand and the explicit flat-color constraint.

## Tokens and type

`src/styles/tokens.css` owns color, typography, spacing, radii and motion tokens. Electric Lime #D7FF52 identifies the local player and primary actions. Signal Coral #FF5148 identifies the rival. Near Black #0B1016, Charcoal #191D25, Soft White #F7F8FA and Muted Text #A9AFBD provide the neutral hierarchy. The error-text tint is lighter coral for small explanatory copy.

Space Grotesk is self-hosted with font-display swap and a system fallback. Scores use tabular figures. Body copy uses normal tracking; compact labels use modest uppercase tracking. No external fonts are fetched at runtime.

Measured token contrasts: near-black on lime 16.65:1; muted text on charcoal 7.68:1; coral on charcoal 5.24:1; control border on charcoal 4.07:1.

## Screens

- **Landing:** editorial headline paired with an assembled game preview: opposing player canvases, scores, coach cue and upcoming move cards. Original vector performers replace stick-figure hero artwork. Three concise feature panels replace repetitive marketing sections.
- **Matchmaking:** animated lime/coral signals converge around a shared center. The found state locks them together. Local video readiness, demo labeling and cancel remain explicit.
- **Preparation:** a large replaceable coach stage, timer ring, upcoming moves, compact player checks and ready control. The ready action doesn't bypass the 30-second preview.
- **Battle:** the reference inspired two large opposing feeds and dedicated HUD bands. Full source frames use contain-fit; labels, scores and feedback sit outside the media. The coach and pictogram queue remain visible below the feeds. Laptop-height rules compact secondary chrome. No reference screenshot or copyrighted gameplay art ships.
- **Results:** a one-time geometric winner reveal, counted-up final scores and personal performance metrics. Next Opponent, Play Again and Leave express intent; the adapter owns continuation policy.

## Motion and accessibility

Motion is the sole animation library. Hover/focus responses use 180–220ms; state entries 320ms; number interpolation 180ms; result count-ups 850ms. The searching signal runs only during matchmaking. Winner motion runs once. Both OS reduced motion and the footer toggle disable CSS and Motion effects. Scores expose exact values to assistive technology rather than continuously announcing interpolated digits.

Semantic buttons, skip link, focused main region on phase changes, `aria-current` round progress, labeled video regions, optional camera consent, status/error announcements and visible keyboard focus remain in place. Player names and labels complement colors. Error/empty/disconnected states retain escape and recovery controls.

## Responsive approach

Desktop/laptop gameplay is primary. Compact-height rules preserve media space. At tablet widths, guidance reflows into its own row. At phone widths, the lobby stacks, preparation becomes one column, player identities/scores remain paired, and move cards reflow. Media is never cropped to fill a panel. These CSS rules still require actual viewport acceptance tests.

## Validation status

- Production build, TypeScript check and existing demo controller tests run successfully.
- `test:render` renders all seven phases, disconnect/error states and an empty choreography state without a browser. It checks page headings, core guidance and absence of invented feedback. **This is not screenshot, layout or browser accessibility testing.**
- Vite ran locally and returned HTTP 200.
- The three supplied images and all five downloaded 21st.dev static previews were visually inspected.
- **Application browser QA is blocked:** available browser inventory was empty and the native UI provider failed to start. No claim is made that desktop/mobile layouts, reduced motion, camera hardware or keyboard behavior were visually verified.

Required follow-up when a browser is available: inspect every phase at 1440×900, 1366×768, 768×1024 and 375×812; check landscape, 200% zoom, keyboard-only flow, OS reduced motion, camera permission denial, full-body framing, real remote tracks and avatar loading.
