# Same-origin runtime dependencies

The app must start and render without third-party CDN access. Keep runtime imports relative to this site. `three` in the import map resolves to the same local module used by the scanner, GLTF loader and renderer.

`chido/` is copied unchanged from MaxLightner/chidoset (formerly tolica-ar), commit `0abbab05c15eed4f3922d1e1dc74b5c17b82e8be`: surfaces.js, xr.js, anchor-rig.js, vendor/three.module.js, vendor/three.core.js, vendor/GLTFLoader.js, vendor/BufferGeometryUtils.js and vendor/THREE-LICENSE.txt. It retains the existing scanner behavior and Three.js r180 runtime.

`three-addons/` contains the complete import closure of EffectComposer, RenderPass, SSRPass and OutputPass from mrdoob/three.js r180, commit `0af9729d0c143a86a1d725d6e2c3ad83301f3f34`, under examples/jsm. The MIT license is in chido/vendor/THREE-LICENSE.txt. These optional reflection effects use the same Three.js instance via the import map.

The welcome image, HDR, appliance models, reference images and materials are also served locally. Hosting itself must still be reachable: removing the CDN dependency does not bypass a network block affecting this site's own domain.
