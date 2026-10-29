# 筑境 AI · Product Design System

## Direction

- Genre: expressive creative workbench (light, warm, editorial — not an enterprise admin)
- Macrostructure: Workbench
- Primary audience: C-end homeowners and B-end decoration teams
- Visual anchor: muted violet ink on warm paper white, with hand-drawn illustrative scenes and soft asymmetric shapes
- Structural fingerprint: light side rail, conversational creator as the hero, mixed-size inspiration board, compact workflow band
- Tone rules: generous whitespace, large type, soft radii (8-24px), playful rotations on decorative elements only; never on functional controls

## Product Rules

- The homepage is an active workbench, not a marketing landing page.
- The first viewport must lead with the user's natural-language design request.
- P0 actions stay visible: upload floor plan/reference image, select one of six styles, start generation, enter the full workspace.
- Demo states must say that the AI service is not connected until a real generation API is integrated.
- Avoid invented platform metrics and fake completed design outputs.
- Templates are inspiration starters. Selecting one fills the composer; it does not pretend to create a final plan.
- Scene illustrations are pure local CSS art (no remote image dependencies) so the interface renders identically offline and in any network environment.

## Tokens

- Workspace: `#FBFAFD`
- Panel: `#FFFFFF`
- Paper-warm section wash: `#F5F2FA`
- Primary violet: `#6A5AD4`
- Violet hover: `#8870D4`
- Ink: `#322E3D`
- Secondary text: `#6F6A7C`
- Muted text: `#A29DAD`
- Warm utility accent: `#D9A35F`
- Border: `#E9E4F0`
- Dark pill surface: `#252834`
- Default radius: 8-16px; decorative blobs up to 24px+

## Typography

- Base size 16px, body line-height 1.7
- Hero display: clamp(37px, 3.7vw, 55px), weight 600, tight line-height 1.25
- Card titles 13px / captions 11px; navigation 13px; never below 10px except micro-labels
