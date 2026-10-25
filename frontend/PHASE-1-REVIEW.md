# Creative redesign — Phase 1 review checkpoint

Implemented the brand intro and native-scroll game walkthrough. Camera setup, matchmaking redesign, gameplay layouts, results, and draggable stickers remain Phase 2–4 work, pending the requested visual review before continuing.

## Changes

- `src/screens/Landing.tsx`: three scenes, rewritten copy, persistent Play button, YOUR MOVE finale. Existing find action remains functional.
- `src/components/entry/WordmarkIntro.tsx`: once-per-page-session SVG path masks reveal the actual supplied raster wordmark, then resolve to the unchanged image. This is a raster reveal, not a vector outline reconstruction. No new logo or typeface substitutes the supplied artwork.
- `src/components/entry/GameStory.tsx`: five-step walkthrough using shared demo choreography, existing counter and choreography renderer interface. Native scroll on larger screens; explicit buttons on all screens. Mobile, short viewports, and reduced motion use manual steps. No camera/audio requests.
- `src/styles/festival.css`: scoped composition, flat brand colors, responsive layouts, fixed-CTA clearance, reduced-motion styling.
- `src/App.tsx`: pass renderer interfaces to the landing demo; remove visible motion toggle while preserving system preferences; update navigation/footer copy.
- `src/main.tsx`: load new stylesheet.

## References

- [Path Drawing Portfolio Hero](https://21st.dev/@httpsdesign-layercomja/components/path-drawing-portfolio-hero): listing identifies MIT and Motion; full source requires an account. Inspected public usage and upstream description. Built an original raster-logo mask, without copying gated code or gradient strokes.
- [Linea](https://github.com/8bsite/app-landing-page-template): inspected public HTML source and MIT declaration. Its progressive sticky product demonstration informed the walkthrough. No source copied; no GSAP/Lenis added. Existing Motion and native scrolling handle the implementation.
- [Rainbow Button](https://magicui.design/docs/components/rainbow-button): inspected public docs/usage and 21st.dev MIT listing; full implementation was not retrieved. Original lime CTA uses press travel and an arrow, with a solid coral offset. No gradients or package import.
- Fruit Sticker Footer: reference could not be retrieved. No code imported; original accessible stickers remain Phase 4 work.

No dependencies added. No backend, MediaPipe demo, logo files, or existing game contracts modified.

## Verification

Passed typecheck, production build, demo tests, render-smoke tests, and git diff whitespace checks. No lint script exists. Vite returned HTTP 200 at http://127.0.0.1:5173.

Visual review is blocked: computer-use tools return no browsers and `Native pipe startup failed`. Desktop/laptop/mobile screenshots, actual scroll timing, focus visibility, and overflow have NOT been verified in a browser. The user explicitly requested this checkpoint before Phase 2, so later phases have not been implemented.

Run from repository root: `npm run dev --prefix frontend`. Review at 1440×900, 1280×800, and 390×844. Check first-load wordmark, native scrolling through five steps, step buttons, injected choreography renderer, persistent Play, reduced-motion mode, and complete existing mock flow. The default choreography renderer remains explicitly labeled placeholder artwork until the team's animation is connected.
