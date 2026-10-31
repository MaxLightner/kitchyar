# Kitchyar — AR-first kitchen editor

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
