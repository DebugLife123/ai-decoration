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

## Integration and behavior

The component exports `LandingPage` as default and assumes the application supplies its own 68px header. The page does not modify routing, navigation, backend, or the existing inspiration page. All action links lead to existing routes: `/workspace?source=floorplan`, `/cad-workflow`, `/canvas`, `/projects`, `/inspiration`, `/materials`, `/cases`, and `/budget`.

Field tabs support mouse/touch, arrow keys, Home and End, selected-tab focus management and associated tab panels. The comparison supports pointer capture, touch dragging and keyboard adjustment; it starts at 50% without autoplay. Resource filters update visible route cards. Entrance animation is brief and non-blocking, with no loading gate. Reduced-motion preference disables page animation/transitions. Mobile layouts stack the hero, galleries and resource cards.
