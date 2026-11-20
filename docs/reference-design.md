# Homepage reference provenance

The user explicitly authorized close replication and reuse of the local handoff at `D:\C盘下载文件夹\architect-ai-desktop-demo-source-handoff-20260813-154004\architect-ai-desktop-demo` for the 简易装 homepage redesign.

## Sources inspected

- `index.html`: hero composition, design-field tabs/gallery, use-case images, comparison stage, resource sections.
- `styles.css`: full-width hero backdrop and overlay, blue/glass buttons, gallery thumbnails, section spacing, hover transforms, dark comparison panel, image clipping and comparison handle.
- `app.js`: field-tab selection and arrow/Home/End keyboard behavior; comparison pointer capture, coordinate mapping, bounds and keyboard adjustment; resource filtering.

These patterns are adapted into React state and handlers in `src/pages/LandingPage.tsx`. Applicable original CSS declarations are retained in `src/pages/LandingPage.css` with scoped selectors and local design variables. Every CSS selector is confined to `.landing-design`; animation names use the `ld-` prefix. No reference JavaScript is loaded globally.

## Copied assets

The following files are copied unchanged from the reference's `assets` directory into `public/reference-design`:

- `hero-interior.png`: hero backdrop and interior tab.
- `hall.png`: hero showcase, gallery thumbnail and budget resource illustration.
- `bedroom.png`: gallery images.
- `bathroom.png`: gallery thumbnails.
- `material-board.png`: canvas illustration and materials resource illustration.
- `floorplan-original.png`: original comparison image and CAD thumbnail.
- `floorplan-ai-render-aligned.png`: aligned rendered comparison image and CAD thumbnail.
- `flow-plan.png`: CAD workflow illustration.
- `consultation.png`: cases resource illustration.

Images are clearly presented as design examples, not live generated results or verified project records. The reference's brand assets, testimonials, fake platform metrics, pending controls, authentication code and splash loader are not included. The right hero panel is a static showcase rather than the original branded demonstration video.

The inspiration cards and template count use the application's existing `templates` export from `src/features/styleLibrary/inspirationTemplates.ts`; the displayed count is computed from that data, not a marketing estimate.

## Optimized serving derivatives

The original PNGs remain unchanged for provenance. The homepage serves matching `.webp` derivatives generated with bundled Pillow 12.3.0, WebP quality 90 and method 6. Width is capped at 1920px for the hero backdrop and 1600px for other imagery, preserving aspect ratio with LANCZOS resampling and never upscaling. Only `consultation` required resizing (1618×972 → 1600×961).

Both comparison images retain their identical original 796×618 dimensions with no crop, resize or alignment change. All derivatives were decoded after encoding and checked for expected dimensions.

| Asset | Original PNG bytes | Served WebP bytes |
| --- | ---: | ---: |
| bathroom | 2,488,944 | 210,084 |
| bedroom | 2,660,673 | 260,156 |
| consultation | 1,993,879 | 170,298 |
| floorplan-ai-render-aligned | 501,739 | 49,334 |
| floorplan-original | 204,286 | 41,558 |
| flow-plan | 2,310,282 | 275,446 |
| hall | 2,903,248 | 355,510 |
| hero-interior | 1,919,380 | 126,970 |
| material-board | 3,104,062 | 389,220 |
| **Total** | **18,086,493** | **1,878,576** |

Reference-image transfer falls from **17.25 MiB to 1.79 MiB (89.61% reduction)**. The eager hero backdrop and showcase together fall from **4,822,628 to 482,480 bytes (90.00% reduction)**, approximately 4.60 MiB to 471.17 KiB. Other reference images retain lazy loading. These numbers measure image file payloads, not total page transfer or measured loading time; the existing inspiration-template imagery is separate.

## Integration and behavior

The component exports `LandingPage` as default and assumes the application supplies its own 68px header. The page does not modify routing, navigation, backend, or the existing inspiration page. All action links lead to existing routes: `/workspace?source=floorplan`, `/cad-workflow`, `/canvas`, `/projects`, `/inspiration`, `/materials`, `/cases`, and `/budget`.

Field tabs support mouse/touch, arrow keys, Home and End, selected-tab focus management and associated tab panels. The comparison supports pointer capture, touch dragging and keyboard adjustment. Its first 35%-visible entry sweeps 10% → 90% in 1600ms, holds 2500ms, then returns to 50% in 1100ms; manual interaction cancels the sequence. The model logo loop reuses 12 original SVGs and the 72px/s motion with hover deceleration. Resource filters update visible route cards. Entrance animation is brief and non-blocking, with no loading gate. Reduced-motion preference disables automatic motion. Mobile layouts stack the hero, galleries and resource cards.

## Account access adaptation

The requested reference `login.html`, `login.css`, and `login.js` supply the split-panel composition, model orbit, theme control, form spacing and responsive behavior. React renders the 简易装 brand and existing backend email/password login and personal/business registration. Unsupported OTP and social login placeholders are omitted. Login is a dedicated route, matching the reference page, with a return-to-home link. The public root remains accessible without authentication; functional routes require authentication, including localhost canvas. Login return destinations retain query parameters and fragments, reject external URLs and login loops. Legacy local-demo sessions are no longer accepted. Administrative and reseller login styling remains independent.
