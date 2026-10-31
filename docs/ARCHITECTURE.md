# Kitchyar architecture contract — A/B/C baseline

## Sources and isolation

| Existing project | Allowed reuse | Boundary |
| --- | --- | --- |
| Chido / `tolica-ar` | UI language, floor-calibration UX, interaction patterns | Never merge its complete WebXR scene and app state into Kitchyar. |
| Archyar / `archyar` | Validated wall/opening domain commands, AR reference logic, offline snapshots | Selectively adapt code after native Android build and license review. |
| Archyar Blender | Semantic parent/child object handling and window gizmo behavior | Blender `bpy` code does not run on Android; use protocol and ideas only. |
| Furniture Designer / Panelizer | A selected tested nesting implementation | Compare on identical panel fixtures, choose one engine behind an adapter; no simultaneous imports. |
| Builder_builder- | None of its app/UI/geometry code | Individual CC0-licensed asset files can be evaluated separately. |

## One durable scene model

The current v1 project JSON stores `id, name, timestamps, revision, scene.items`, where each temporary `volume` has stable ID, metric X/Z position, width, depth, height, color. This is **not yet a cabinet-unit schema**. Phase E/F expands the versioned model using migrations instead of repurposing `volume` into an undocumented production object.

Future IDs: `wallId`, `hostWallId`, `cabinetRunId`, `equipmentId`, `unitId`, `panelId` and `materialId`. Dimensions and cuts remain in authoritative mathematical coordinates; rendering meshes, camera tracking anchors and physical sheet layouts are derived views.

Current preview uses browser localStorage as a storage adapter and canvas for 2D/3D projections. Android Activity hosts this same asset set without source duplication. The native AR renderer is a **future separate adapter**, not a simulated working AR button in this release. Offline storage and 3D renderer must be hardened/changed before production.

## Stage boundaries

- **A/B/C:** project persistence, UI interaction, 2D/isometric 3D proof, Android host and CI build attempt.
- **D/E:** floor tracking calibration and semantic walls/openings with native ARCore.
- **F/H:** cabinet runs and unit solver, using dedicated parametric domain objects.
- **I/J:** doors, drawers, materials, detail/decoration.
- **K:** VR viewer of same project data.
- **L:** deterministic panel BOM, banding and sheet nesting with a separate pure calculation API; accessed from Project Management, not inside AR.

## Acceptance gates

Every phase records: implemented code, automated tests, on-device tests when applicable, known limitations and dependent decisions. Passing Node tests or UI preview alone is **not** proof of AR tracking, Android APK compatibility or manufacturing accuracy.
