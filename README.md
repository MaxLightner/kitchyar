# Kitchyar / کیچیار

Independent kitchen-design project. **Phase A–F interactive alpha**, not a manufacturing-ready kitchen editor.

## Current capability

- Welcome, project list and project operations (create, rename, duplicate, delete with confirmation, JSON backup).
- Local-first, versioned project persistence and transparent failure on corrupt storage.
- Shared metric plan and isometric 3D view, selection, resizing, mini-map, Undo/Redo.
- Phase D: WebXR hit-test floor preview on supported Android Chrome/ARCore, explicit floor confirmation,
  A/B measurement and display-only calibration; non-AR editor always remains available.
- Phase E: click/drag metric walls; host-bound doors and windows; five selection handles for
  windows in 3D, numeric inspector, wall openings in 3D geometry, collision and boundary checks.
- Phase F: click/drag continuous base and upper cabinet runs, independent mounting elevation,
  editable length/depth/height, **no premature unit segmentation**.
- A one-click demo project from Welcome or Project Management.
- Android APK hosts the same offline UI; **WebXR AR requires a separate supporting browser**.

## Run

```sh
npm run check
npm run preview
```

Then open `http://127.0.0.1:4173/`.

The GitHub Pages workflow publishes only `apps/preview` at `https://maxlightner.github.io/kitchyar/` **once Pages is enabled** for the repository. Private-repository Pages availability depends on the GitHub account plan; keep the repository private unless the owner explicitly approves publishing its source. The workflow alone cannot grant Pages entitlement.

The private repository's CI builds an Android APK. In an Android SDK environment, run
`gradle -p apps/android assembleDebug` using Gradle 8.10.2 / Java 17. A real ARCore
device was **not available** for this implementation; AR accuracy and camera permissions
require physical device verification. The APK is an offline UI host, not a native ARCore renderer.

## Architecture rules

1. `apps/preview/core.js` is an isolated versioned project-domain module; the 2D/3D renderer does not own dimensions.
2. Wall/opening/cabinet domain objects live in `apps/preview/core.js`. WebXR is an optional
   adapter in `apps/preview/ar.js`; no Builder/Archyar/Chido application source was copied.
3. Chido is the visual/interaction reference; Archyar the potential wall/AR source; Archyar Blender the semantic opening/handle reference.
4. The ordinary web 3D view is an **isometric canvas visualization**, not a full perspective
   PBR renderer. The separate WebXR adapter uses real metric 3D meshes on supported phones.

Read [docs/PHASES_D_E_F.md](docs/PHASES_D_E_F.md) for completed vs pending acceptance gates,
and [THIRD_PARTY.md](THIRD_PARTY.md) for the AR renderer dependency.
