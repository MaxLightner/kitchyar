# Third-party code and licenses

## three.js (AR viewer only)

- Source: https://github.com/mrdoob/three.js
- Version pinned by URL: `0.168.0`
- Runtime: `https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js`
- License: MIT (https://github.com/mrdoob/three.js/blob/r168/LICENSE)
- Usage: WebXR renderer, semantic mesh preview, hit-test floor visualization.
- Modifications: none; loaded through a dynamic module import, not vendored.
- Failure mode: the ordinary offline 2D/3D UI still works if the external module is unavailable.

No complete Chido, Archyar, Archyar Blender, or Builder source was copied into Kitchyar.
