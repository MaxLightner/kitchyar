# Kitchyar — UI-first rebuild

The old A–F experimental canvas/renderer code has been replaced. The active scope is deliberately limited to three screens:

1. Welcome
2. Projects (local create, open, rename, duplicate, delete)
3. AR-first Editor (floor scan and calibration UI; cabinetry and wall editing are future stages)

## Floor scan fidelity

The adapter imports the exact pinned Chido v0.5.7 FloorScanner, the same xr.js session request, and the same AnchorStabilizer from commit 0abbab05c15eed4f3922d1e1dc74b5c17b82e8be.

The integration also uses Chido's eight auxiliary hit-test rays, floor grid shader, height clustering, accepted hit markers, independent observations, floor confirmation, anchor acquisition and 10-cm A/B ticks.

**Limitations:** Native AR requires Android Chrome with ARCore/WebXR and HTTPS. Desktop browser previews cannot validate floor tracking or physical alignment. 2D/3D editor modes intentionally announce that they are not yet implemented.

Preview: https://maxlightner.github.io/kitchyar/
Check: npm run check

The previous code remains recoverable in Git history and branch archive-pre-ui-rebuild-20261031. Existing browser data from the previous version was not deleted; the rebuild uses a new storage key.
