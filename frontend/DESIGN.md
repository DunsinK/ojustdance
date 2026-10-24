# Shared Beat design system

## Direction

Social rhythm gaming: an editorial poster meets an approachable dance floor. Two geometric figures, two colors, one central beat. Flat colors, bold type, fine borders and generous negative space. No gradients or dashboard navigation.

The ui-ux-pro-max gaming search identified bold gaming typography, feature showcase structure and an immersive stage. Its proposed hyperrealism, purple palette and complex effects were deliberately adapted to the requested flat cobalt/coral brand and lightweight hackathon scope. React guidance informed timer and subscription cleanup. User palette and reduced-motion requirements take precedence over database recommendations.

## Tokens

`src/styles/tokens.css` is the source of truth: Electric Cobalt #485BFF, Punch Coral #FF6B4A, Midnight Ink #14151F, Soft Charcoal #252735, Cloud White #F8F8FC, Muted Slate #AAB0C2. Light cobalt is used for readable small accents on dark surfaces. White labels on cobalt buttons; coral uses ink or remains a decorative accent. System Arial/Helvetica avoids network-dependent font loading. Strong, tightly tracked headings; normal body tracking; uppercase metadata only for short labels.

## Components and hierarchy

- Temporary eight-point star mark; replace `Brand`/`Star` when the official asset arrives.
- One primary action per view: find, ready, next opponent. Cancel/leave stay secondary and available.
- Local player: cobalt + “You / P1”; opponent: coral + “Stranger”. Labels carry identity independently of color.
- Large unobstructed video panels. Scores sit above; move cues and progress sit below.
- Thin outlines define surfaces. Rounded panels contrast with geometric poster artwork.
- 700px and 1000px responsive breakpoints; stacked preview and compressed two-player battle on phones. Desktop is the intended full-body gameplay surface.
- Motion means progress: searching pulse and short screen entry. No perpetual hero animation. Respect OS reduced motion and the footer motion toggle.

## Manual QA checklist

- At 375px, 768px, desktop, and landscape: check horizontal overflow, wrapping, video identity labels and countdown.
- Keyboard-only: find → cancel → find → ready → results → next; focus follows each phase.
- Test reduced motion and browser zoom at 200%.
- Camera denied, unavailable, enabled/off, leave while permission prompt is open, and unmount cleanup.
- Demo controls: disconnect and error, recover, skip preview before ready, then ready after preview.
- Real integrations: server clock drift, remote disconnect, audio autoplay permission, avatar loading failure and score reconciliation.

## UX review — October 24, 2026

Scope: ui-ux-pro-max accessibility, typography, responsive layout, motion, and gameplay-space checklist. This was a **source-based review**, not a completed visual acceptance pass: the available browser inventory was empty and native app access failed. Vite was started and its local HTTP response verified (200 OK). Screenshots, actual viewport/zoom behavior, hardware camera framing, and a browser walkthrough remain unverified.

Concrete fixes:

- Webcam uses `object-fit: contain` so feet, hands, and edges of the source frame are not cropped. Player identity and status occupy separate header/footer bands instead of covering the image.
- Countdown is a compact banner above the arena, preserving the camera view while players position themselves.
- Short desktop viewports reserve a practical 300–430px camera panel; mobile battle panels increased to 320px. These dimensions still require visual acceptance on target devices.
- Current move has stronger type and coral emphasis. Next-move cues remain present on tablet/mobile rather than disappearing.
- Metadata is generally at least 12px; explanatory mobile copy is 16px. Narrow navigation wraps, timer layouts can reflow, and progress steps expose `aria-current`.
- Readiness action appears before the long move list; opponent readiness comes from player state. Completed previews retain the final move instead of returning to the first.
- Reduced motion prevents the decorative avatar from flipping, not just its CSS transition. Buttons have pressed feedback. Secondary controls have a higher-contrast border token.
- Camera-off control remains reachable on results/disconnection screens; clearing the camera also clears old permission errors.
- Removed the unsubstantiated registered-trademark symbol and implementation-oriented stage copy.

Measured token contrasts: Cloud White/Cobalt 4.70:1; Muted Slate/Charcoal 6.83:1; Coral/Surface 5.94:1; control border/Charcoal 3.51:1 (see source tokens for exact values).

Production build, TypeScript, and existing demo-flow tests are the automated acceptance checks. No new dependencies were added. Browser verification remains a required follow-up when a browser is connected.
