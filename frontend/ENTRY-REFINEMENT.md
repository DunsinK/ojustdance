# Entry experience / art-direction pass

Scope: landing and matchmaking only. The preview, battle, results, renderer contracts, real logo assets, and backend files are preserved. Matchmaking remains re-exported from `screens/Room.tsx` for existing consumers.

## Visual direction

Oversized, line-revealed typography; a full-width lime/coral choreography stage; an unmistakable lime CTA; unboxed editorial instructions. The existing real wordmark remains in the header. The stage is an explicitly labeled illustrated demo, not camera footage or Muse output. Selecting a move changes two articulated, clothed vector avatars; the silent 12-second playback can be paused and stops offscreen, in a hidden tab, or after one cycle. Reduced-motion mode replaces playback with a next-move action.

The lobby uses two original geometric signals. Searching has an unknown rival; only `phase: found` confirms one. Signals converge on confirmation, followed by connecting, with separate interruption and cancellation treatments. A transport connection alone does not confirm a match. Cancel stops the local camera and dispatches the existing cancel action; its acknowledgement is local UI state, without changing the adapter's home phase contract. Camera permission is still requested only by the camera button.

## References and component decisions

References were researched through their public descriptions and available source. Browser visual inspection was unavailable in this environment; these are not claims of screenshot comparison.

| Reference | Useful principle / decision |
| --- | --- |
| [Prism](https://21st.dev/@mohammadshehadeh/templates/prism) | Dominant media and staged headline. Reject glass effects. |
| [Scroll Tear](https://21st.dev/@kedhareswer/templates/scroll-tear-portfolio-website-template) | Distinct scene transitions. No copied paper effects/template. |
| [Cherry Blossom](https://21st.dev/@kedhareswer/templates/cherry-blossom-saas-landing-page) | Interaction should produce a visible consequence. Use move selection rather than decorative particles. |
| [Beat Saber](https://beatsaber.com/) | Put the game experience first. No copied assets. |
| [Just Dance](https://www.ubisoft.com/en-us/game/just-dance) | Direct invitation to play and approachable language. No copied assets. |
| [Ableton Move](https://www.ableton.com/en/move/) | Immediate hands-on exploration and confident product hierarchy. |
| [Magnetic Button](https://21st.dev/@mohammadshehadeh/components/magnetic-button) | Inspected [registry source](https://hirael.com/r/magnetic-button.json): MIT, Motion, Radix Slot, shared button utility. Original equivalent uses existing Motion, mouse-only attraction, fixed hit target, reduced-motion bypass. No Radix or source copied. |
| [Spinner Morph](https://21st.dev/@lyanchouss/components/spinner-morph) | Public demo reviewed; complete source/license not verified. Not imported. Original state-driven signals instead of an ornamental morphing loader. |
| [Number Ticker](https://21st.dev/@danielpetho/components/basic-number-ticker) | Public listing identifies Motion and MIT. Existing accessible AnimatedNumber already covers this behavior; reused without copying or another dependency. |
| [Text Reveal](https://preview.21st.dev/@cnippet-dev/components/text-reveal) | Public listing identifies Motion and MIT. Original line-level transform reveal keeps a normal semantic heading. No blur, split-character accessibility issues, or source import. |
| [Music Card](https://21st.dev/@kavikatiyar/components/card-6) | Public example uses Framer Motion/Lucide; license/full source not verified. Rejected boxed cover/hover pattern. Original inline controls actually play the visual routine and explicitly say no audio. |

No new dependencies. Existing palette, typeface, focus styling, and motion preference remain authoritative. New CSS is entry-scoped and uses the central color/font/gutter tokens.

## Changed files

- `src/screens/Landing.tsx`: full-width interactive entry stage and editorial instructions.
- `src/screens/Matchmaking.tsx` (new): all five lobby states and recovery controls.
- `src/components/entry/EntryMotion.tsx` (new): magnetic CTA, state-driven signals, articulated demo avatar.
- `src/styles/entry.css` (new): desktop/laptop/mobile compositions, state and reduced-motion styling.
- `src/App.tsx`: lobby routing, cancellation acknowledgement, stable keyboard focus within lobby.
- `src/screens/Room.tsx`: extract matchmaking and retain its export; preview implementation unchanged.
- `src/main.tsx`: load scoped entry stylesheet.
- `src/demo/controller.ts`: explicit connecting interval after a simulated match confirmation.
- `tests/demo.test.mjs`, `tests/render-smoke.mjs`: connecting-flow, honest match states, cancelled view, and regression coverage.
- `ENTRY-REFINEMENT.md`: this handoff.

## Validation and limitations

Passed: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:render` (all run in frontend). Render checks include normal screens, real-mode queue/room connecting and failure states, cancellation, and empty choreography. These are not browser interaction tests. No lint command is configured in package.json.

The running Vite server at http://127.0.0.1:5173 returned HTTP 200. The computer-use bridge returned no browsers and `Native pipe startup failed`; Superset CLI is also unavailable. Consequently the requested 1440×900, 1280×800, and mobile visual review, measured overflow, actual tab order, and animation timing still need browser verification. No screenshots were fabricated. Responsive breakpoints were reviewed in code only.

## Run and inspect

From repository root:

```sh
npm run dev --prefix frontend -- --host 127.0.0.1
```

Open the URL printed by Vite. Select each move, play/pause the silent demo, and use Find a match. Demo controls can skip each interval (search → found → connecting → preview) and simulate failures. Cancel shows an acknowledgement with restart/home actions. Check at 1440×900, 1280×800, and 390×844, including keyboard-only and OS reduced-motion mode.

For the production bundle: `npm run build --prefix frontend`, then `npm run preview --prefix frontend`.

## Integration handoff

The GameAdapter and renderer interfaces are unchanged. Socket.IO should provide authoritative phase/connection snapshots; `found + connecting` means a confirmed rival with room setup in progress, while `searching + connecting` means matchmaking transport setup without a confirmed rival. LiveKit streams still enter through App's streams/renderers. The new lobby only mounts a local video preview when a stream exists. The illustrative landing animation is independent of MediaPipe, Muse, and Three.js; replace DemoAvatar with project-controlled choreography when available, retaining explicit demo labeling until real output is used.
