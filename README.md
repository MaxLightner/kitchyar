# Kitchyar — AR-first hybrid web editor

> **Current delivery target:** hybrid Web app / PWA / WebXR. No Android APK build or release is in scope. The old Android WebView proof of concept is dormant. Read [the logic contract](docs/logic-contract.md) before changing geometry, fixture or facade rules; contradictions must be reported to the user before edits.

## Room geometry and editing (room40)

- Cabinet strokes across acute or obtuse wall bends create a low-polygon trapezoidal corner connector, including at 20°. It follows both neighboring cabinet ends when host walls change.
- New walls default to 3.60 m. Wall editing snaps dimensions to centimetres and propagates connected endpoints, openings and cabinets.
- Ivory 1 m × 1 m ceramic floor and solid ceiling share a plan-derived outline. Both default to hidden and toggle together from the side toolbar. Ceiling height in settings resizes all walls with undo/redo.
- Fridges can stand alone or replace a cabinet run; side-by-side models use larger dimensions and undersized leftover bays become side fillers, not tiny cabinets.
- Five selectable faucet models, one- to four-leaf Iranian sliding-style windows, delayed return of window glazing after resize, half-size resize grips and cross-shaped A/B calibration marks.

Welcome → Projects → Editor, plus a standalone fabrication report accessible directly from each project and beside AR/3D/2D in the editor header. Editor opens in AR, using the pinned Chido FloorScanner, multi-ray surface detection, stabilizing anchors and A/B calibration.

## Architecture tools (2026-10-31)

The browser geometry module apps/preview/geometry.js ports the relevant semantics of Archiyar WallTopology.java, DrawingSnap.java and WorkspaceModel.java:

- Continuous start/end wall runs, point/segment snapping before 45° angle snapping, stable shared endpoint IDs.
- Endpoint, T and crossing connections with split walls and hosted opening remapping. Invalid splits inside an opening are rejected atomically.
- Host-wall-bound fixed windows and hinged doors with nonoverlap, hinge direction, open angle and dimension constraints. Rectangular voids are built into the WebXR 3D wall mesh.
- Continuous base and upper cabinet runs with independent height, elevation and depth.
- Numeric edits, wall/cabinet endpoint and opening-handle dragging in the 2D plan, undo/redo and local persistence, using shared metric data for WebXR and plan.
- Persistent 10 cm AR floor grid after floor confirmation.
- All UI font sizes are at least 13 CSS pixels, including mobile.

Editor defaults to AR. After a tracked AR session has recognized and locked the floor, **3D** switches to a camera-free, wide-perspective view that keeps the same live WebXR pose, 1:1 building geometry and AR editing handles. Its Normal/Wide/Ultra choices have 60°/84°/100° horizontal FOV. The virtual camera takes the unmodified central XR viewer pose (including height) in every frame; only its projection changes. Returning to AR restores the real camera without restarting tracking. This uses an independent opaque WebGL canvas inside the supported WebXR DOM overlay; a browser without a full-screen overlay is told that tracked wide mode is unavailable. Without an AR session the existing orbital 3D preview remains available, but it is not described as tracked. AR places points with the centre hit-test crosshair after the floor is locked.

## Standalone cutting report

- From **Projects → گزارش ساخت** or the editor's **گزارش** header tab, open `#/report/<project-id>` without requiring camera, AR tracking or the editor view.
- The report derives semantic facade dimensions from each door/drawer width, height, gap, material, grain and hinge, with numbered elevation diagrams and material summaries.
- Adjacent base-cabinet countertop stretches on the same wall are grouped for a schematic plan, showing estimated span/depth and the real sink/hob aperture locations derived from the project model. Separate angled runs retain explicit seam warnings.
- **چاپ / PDF** uses an A4-landscape print stylesheet (choose Save as PDF in the browser print dialog). **دریافت Excel** creates a real offline `.xlsx` file with six sheets and numeric millimetre measurements without third-party runtime dependencies.
- Reports always recalculate from the current saved project. They remain **schematic**: sheet thickness, edge banding, hinge drilling, manufacturing tolerances, and countertop joinery are not yet specified and must be verified before CNC/cutting.
- A new **MDF facade sheet nesting** section packs all door and drawer-front rectangles by finish into configurable stock sheets (default 2800×2070 mm, 3 mm saw kerf, 10 mm margin), preserving horizontal/vertical grain direction for wood. It displays material-based sheet counts, numbered sheets, precise rectangular piece coordinates, unplaceable-piece warnings, and print-ready SVG sheet layouts. The XLSX export includes stock, placements and unplaced-pieces worksheets with typed numeric measurements. Unit carcasses are deliberately excluded for now. This is an estimated rectangular cutting plan, not an optimized CNC program.
- The interactive report shows one MDF sheet diagram at a time, with **previous/next** controls and the active sheet code, material, and sheet number. Both the diagram and its individual placement table switch together. PDF/print output explicitly reveals every sheet on its own page, and Excel always exports the complete set.

## Selection performance and AR dialog UX

- Choosing an object now changes emissive selection accents and edit grips incrementally, without rebuilding all meshes, refreshing reflection probes, or re-running raycast ambient occlusion. Material and geometry changes are batched into a single rebuild per scene update.
- Editor dialogs are descendants of the active WebXR DOM-overlay root, so kitchen-style photos, rules and cut previews remain visible **inside** immersive AR. Dialog backdrops and Escape dismiss settings; re-tapping the current object or tapping genuinely empty tracked space dismisses its property editor.
- Tool panels have explicit close controls; changing a kitchen style applies facade layout first, lets the browser paint, then applies finish materials after a short delay as a single undoable edit.

## Lightweight, genuinely hollow cabinet units

- Every installed cabinet now renders a **parametric carcass derived from the project model** in all render modes. It is assembled from 18 mm side/bottom/top/divider boards and a thin 8 mm back, never an opaque white cuboid or a CSG/Boolean-cut shell. Base cabinets deliberately have no full top board beneath the continuous worktop, leaving sink cavities unobstructed.
- Paired doors and stacked drawers share their underlying bay. Front layout boundaries and built-in appliance widths derive vertical dividers; bottom boards automatically stay out of dishwasher and washing-machine bays. Open bridges keep four lightweight shelves. A closed door no longer changes whether its unit exists.
- Every board uses exactly 12 triangles, and all boards of a cabinet are combined into **one indexed draw mesh** with one plain-white, texture-free interior material. Finished exposed ends, countertop and toe kick remain separate. Open drawers retain their moving trays.
- The editor's new **درب‌ها** sidebar button conceals or restores all door/drawer fronts (including specialty niche doors) in tracked AR, 3D and 2D. It updates mesh visibility without recomputing ambient occlusion or changing the project, undo history or facade cutting report. Interior shelf/partition **editing** and carcass manufacturing-sheet nesting are future steps.

### Unit-level facade interaction and motion

- Interiors are generated with their host cabinets and stay present whether selected or not. Every drawer has a separate low-poly white drawer box, including when the facade is hidden. Only the facade leaf is concealed by the visibility toggle.
- Front opening is an independent 420–520 ms cubic-ease motion, with a gentle soft-close finish. It moves/rotates existing groups (doors and their handles, drawer fronts and their boxes), without remeshing the kitchen, recomputing raycast AO or refreshing textures. Undo still records the target opening state.
- A closed front is single-tapped for settings, double-tapped to open, and triple-tapped to select its entire bay/unit; an opened front closes on a fresh single tap. In unit selection, convert just that bay to hinged doors or two, three or four drawers with actual internal boxes while neighbouring units keep their original layouts.
- Removing a top drawer in a mixed door/drawer bay automatically extends the lower pair of doors to the underside of the worktop. Adjacent cabinet runs on an interior L-corner now reserve actual cabinet depth, not just wall thickness, to prevent protruding interpenetrations; oblique and multi-way wall caps use a nearby angular joint instead of a square stub.

## Surface library, kitchen styles, and editable equipment

- `در و کشو → گالری`: four generated kitchen style photographs are actionable presets, not decorative mockups. Selecting a style recalculates semantic door/drawer layouts and applies a coordinated material palette; individual fronts remain editable afterward.
- `متریال`: independent high-resolution WebP source textures for cabinet carcasses and facades, quartz/marble worktops, and auto-generated backsplash tiling. Each family keeps its own file. Material UV repeat follows physical dimensions; wood grain is vertical on doors and horizontal on drawers by default, with a per-front override.
- Backsplashes are automatically meshed between worktops and upper cupboards, and omit intersecting openings. Users change only the backsplash material.
- Dishwashers and washing machines now occupy an under-counter aperture within their existing cabinet run; they never split the cabinet or its continuous worktop. Only sinks and hobs generate worktop cutouts.
- Installed equipment can be selected, moved, or deleted transactionally in 2D/AR. Moves recalculate cutouts and linked hoods; removing an appliance reflows facade panels into the emptied bay. Older fridge-style integrated bays are restored when removed.
- `3D` uses the live tracked Wide View when AR is active and the floor is locked; otherwise, the existing desktop orbital preview uses the same scene mesher and materials without requiring ARCore.

### Finished surfaces and reusable kitchen styles

- Connected non-orthogonal walls use capped miter geometry shared by plan and 3D/AR; sharp junctions have a bevel limit to avoid protruding spikes.
- Carcasses render in neutral white. Only exposed end panels can use a body finish, separately for base and upper cabinets; individual facade panels and decorative frames are independently paintable.
- Select a facade and paint a single panel, its connected run, all cabinets on the same level, or the whole kitchen. The material picker also gives separate base/upper finish defaults.
- Gallery styles are defined once as semantic layout/handle/material rules; a selected style is saved in the project and can be chosen before any cabinet is installed. Later cabinet additions inherit it.
- Cabinet, countertop and backsplash WebP images remain independent but were downsampled to at most 1024 pixels and compressed from 2.31 MB to 0.49 MB in total. The 3D renderer shares GPU texture objects; panel UV coordinates provide individual repeats and wood-grain rotation.

## Source fidelity and boundaries

The WebXR scanner is imported from pinned Chido commit 0abbab05c15eed4f3922d1e1dc74b5c17b82e8be. The geometry code is a JavaScript port of selected native Archiyar domain operations from commit 89283ef; it is not a byte-for-byte Android runtime. The UI editor keeps one semantic model per project.

Unimplemented: full cabinet product/manufacturer catalog, native Android synchronization. Physical AR floor alignment and room-scale drawing still require testing on an ARCore phone.

Preview: https://maxlightner.github.io/kitchyar/
Check: npm run check

The pre-rebuild source is recoverable in the branch archive-pre-ui-rebuild-20261031. Local project data from older versions was not deleted.
