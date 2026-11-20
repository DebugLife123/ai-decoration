# Reference navigation adaptation verification

Scope: personal navigation shell and landing page, shared personal-page surfaces. No generation API, task lifecycle, backend, or permission checks changed.

## Reused design

See reference-design.md for original asset provenance and image optimizations. Navigation preserves the reference's 68px header, 42px pills, 340ms expanding circle / rolling labels, and scroll threshold of 40px. Existing React routes replace placeholder controls. Full-screen canvas, personal profile and whole-home report retain their independent layout.

## Browser checks

Executed against the existing Vite application at http://127.0.0.1:5177 with Chrome CDP and the local demo account. Desktop viewport 1440×1000, mobile viewport 390×1000.

- Home renders with no failed images and no horizontal overflow.
- Comparison slider ArrowRight changes value 50 → 52.
- Workflow tab switches to the canvas content.
- AI creation disclosure opens with three live links; Escape closes it and focuses its trigger.
- Header enters its solid scrolled state after scrolling.
- Projects, workspace, inspiration, materials, cases, budget: header visible, main padding 68px, no horizontal overflow.
- Profile and canvas: global header hidden, main padding zero, no horizontal overflow.
- Mobile navigation opens at 354px within a 390px viewport; resource menu opens; material link navigates and closes the menu.
- No Runtime.exceptionThrown events during the above checks.

Images captured locally in ignored qa/screenshots. The executing model does not support image input, so screenshots were not visually inspected; pixel-perfect visual parity is not claimed. Browser checks cover DOM geometry and functional interactions, not a new paid AI generation end-to-end run.

## Build checks

- npm run build: passed (existing large-chunk advisory remains).
- npm run lint: 152 warnings, zero errors, same count as before this adaptation.
- Navbar and LandingPage targeted lint: zero warnings/errors.
- git diff --check: passed.

## Scope boundaries

Full-site dark theme remains the separately planned C phase. The homepage does not reproduce long blocking loading screens, source branding, unimplemented links or fabricated marketing metrics. Enterprise navigation retains existing entries; administrative/reseller layouts remain separate. Existing task recovery behavior is retained, including the current explicit recognition restart behavior.
