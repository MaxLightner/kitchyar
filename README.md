# Kitchyar / کیچیار

Independent kitchen-design project. **Phase A/B/C implementation baseline**, not a complete cabinet or AR editor.

## Current capability

- Welcome, project list and project operations (create, rename, duplicate, delete with confirmation, JSON backup).
- Local-first, versioned project persistence and transparent failure on corrupt storage.
- Shared metric scene preview in 2D/3D, touch/mouse selection, movement, editable dimensions, live mini-map, Undo/Redo.
- Chido-inspired compact bottom dock, tool sheets and colors. Future tools are explicitly disabled.
- Android UI host uses the same local assets (no duplicated UI source), with a native ARCore layer reserved for phase D.

## Run

```sh
npm run check
npm run preview
```

Then open `http://127.0.0.1:4173/`.

The GitHub Pages workflow publishes only `apps/preview` at `https://maxlightner.github.io/kitchyar/` **once Pages is enabled** for the repository. Private-repository Pages availability depends on the GitHub account plan; keep the repository private unless the owner explicitly approves publishing its source. The workflow alone cannot grant Pages entitlement.

The private repository's CI attempts an Android APK build. In an Android SDK environment, run `gradle -p apps/android assembleDebug` using Gradle 8.10.2 / Java 17. The SDK and a real ARCore device are **not available** in this workspace, so a local APK/device verification is not claimed.

## Architecture rules

1. `apps/preview/core.js` is an isolated versioned project-domain module; the 2D/3D renderer does not own dimensions.
2. AR, future wall/opening data and production data will be added via contracts/adapters, not by importing entire Chido/Archyar/Builder applications.
3. Chido is the visual/interaction reference; Archyar the potential wall/AR source; Archyar Blender the semantic opening/handle reference.
4. This baseline provides an **isometric canvas visualization**, not a production 3D renderer. Native ARCore floor scan and modeling tools begin in phase D onward.

Read [docs/PHASES_A_B_C.md](docs/PHASES_A_B_C.md) for completed vs pending acceptance gates.
