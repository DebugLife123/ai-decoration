# Public website and account access

## Intended behavior

- `/` is the public website entry. A fresh visitor sees the homepage and login/register action.
- Functional routes (workspace, CAD, canvas, projects, inspiration, materials, cases, budget, membership) require authentication, including localhost canvas.
- Login is a standalone page following the supplied reference, with a home link to dismiss account access and return to browsing.
- The original destination's path, query and fragment are retained through login. External return destinations and login loops are rejected.
- Real authenticated sessions remain signed in. Legacy local-demo sessions are discarded and the local-demo login shortcut is removed.
- Consumer sign-out from the header or profile returns to the public homepage.

## Reference and backend adaptation

The original login page's split-screen composition, dark interior backdrop, model orbits, form layout, theme switch and responsive treatment are adapted to 简易装. Original model SVGs and optimized reference interior artwork are reused. Email/password login and personal/business registration use the existing server endpoints. Unsupported SMS verification and social-provider placeholders are not displayed. Backend/admin/reseller authorization is not replaced.

## Verification

Verified against the existing local app with Chrome CDP at desktop 1440×1000 and mobile 390×844:

- Fresh session `/` renders the landing page, not the login page.
- All nine tested business destinations redirect to login: workspace, canvas, CAD, projects, materials, cases, budget, subscription and inspiration.
- Workspace query and fragment survive: `/workspace?source=floorplan#upload` → login → same complete destination after real demo-account authentication.
- Personal registration exposes required name/email/password; choosing business adds company name. No new account was created in this regression.
- Header sign-out returns to `/` with cleared session. A seeded legacy local-demo session is discarded and `/canvas` redirects to login.
- Login desktop and mobile have no document horizontal overflow. Mobile form is 334px wide with 24px margins inside the 390px viewport (browser scrollbar accounts for remaining width).
- Theme toggle changes the login palette; outer orbit reports a 46s animation and reduced-motion disables it.
- Five safe-destination cases pass (internal path retained, external/login-loop paths rejected).
- No Runtime.exceptionThrown events during the final browser run.
- Production build passes with the existing large-chunk advisory. Targeted lint: zero warnings/errors. TypeScript and git diff whitespace checks pass.

Browser scripts remain local ignored QA artifacts. Checks establish functional behavior and DOM geometry; screenshot pixel parity was not visually reviewed.
