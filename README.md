# Kitchyar — AR-first kitchen editor

Three screens: Welcome → Projects → Editor. Editor opens in AR, using the pinned Chido FloorScanner, multi-ray surface detection, stabilizing anchors and A/B calibration.

## Architecture tools (2026-10-31)

The browser geometry module apps/preview/geometry.js ports the relevant semantics of Archiyar WallTopology.java, DrawingSnap.java and WorkspaceModel.java:

- Continuous start/end wall runs, point/segment snapping before 45° angle snapping, stable shared endpoint IDs.
- Endpoint, T and crossing connections with split walls and hosted opening remapping. Invalid splits inside an opening are rejected atomically.
- Host-wall-bound fixed windows and hinged doors with nonoverlap, hinge direction, open angle and dimension constraints. Rectangular voids are built into the WebXR 3D wall mesh.
- Continuous base and upper cabinet runs with independent height, elevation and depth.
- Numeric edits, wall/cabinet endpoint and opening-handle dragging in the 2D plan, undo/redo and local persistence, using shared metric data for WebXR and plan.
- Persistent 10 cm AR floor grid after floor confirmation.
- All UI font sizes are at least 13 CSS pixels, including mobile.

The active UI and navigation remain the earlier three-screen structure. Editor defaults to AR. To test without an AR device, use the 2D editor or the desktop 3D orbital preview. AR places points with the centre hit-test crosshair after the floor is locked.

## Surface library, kitchen styles, and editable equipment

- `در و کشو → گالری`: four generated kitchen style photographs are actionable presets, not decorative mockups. Selecting a style recalculates semantic door/drawer layouts and applies a coordinated material palette; individual fronts remain editable afterward.
- `متریال`: independent high-resolution WebP source textures for cabinet carcasses and facades, quartz/marble worktops, and auto-generated backsplash tiling. Each family keeps its own file. Material UV repeat follows physical dimensions; wood grain is vertical on doors and horizontal on drawers by default, with a per-front override.
- Backsplashes are automatically meshed between worktops and upper cupboards, and omit intersecting openings. Users change only the backsplash material.
- Dishwashers and washing machines now occupy an under-counter aperture within their existing cabinet run; they never split the cabinet or its continuous worktop. Only sinks and hobs generate worktop cutouts.
- Installed equipment can be selected, moved, or deleted transactionally in 2D/AR. Moves recalculate cutouts and linked hoods; removing an appliance reflows facade panels into the emptied bay. Older fridge-style integrated bays are restored when removed.
- `3D` now displays the same scene mesher and materials in a desktop orbit viewer without requiring ARCore.

## Source fidelity and boundaries

The WebXR scanner is imported from pinned Chido commit 0abbab05c15eed4f3922d1e1dc74b5c17b82e8be. The geometry code is a JavaScript port of selected native Archiyar domain operations from commit 89283ef; it is not a byte-for-byte Android runtime. The UI editor keeps one semantic model per project.

Unimplemented: full cabinet product/manufacturer catalog, native Android synchronization. Physical AR floor alignment and room-scale drawing still require testing on an ARCore phone.

Preview: https://maxlightner.github.io/kitchyar/
Check: npm run check

The pre-rebuild source is recoverable in the branch archive-pre-ui-rebuild-20261031. Local project data from older versions was not deleted.
