import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export function createKitchenReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  const receivers: THREE.Mesh[] = [];
  const ssr = new SSRPass({ renderer, scene, camera, width: size.x, height: size.y, selects: receivers, groundReflector: null });
  ssr.opacity = 0.48;
  ssr.maxDistance = 5;
  ssr.thickness = 0.035;
  ssr.resolutionScale = 0.5;
  ssr.blur = true;
  ssr.bouncing = false;
  const output = new OutputPass();
  composer.addPass(ssr);
  composer.addPass(output);
  // XR and ordinary 3D share this composer and WebGL context. In immersive
  // mode, composite its completed mono image into the current XR framebuffer.
  const copyMaterial = new THREE.ShaderMaterial({
    uniforms: { source: { value: null as THREE.Texture | null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=texture2D(source,vUv);}',
    depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending,
  });
  const copyQuad = new FullScreenQuad(copyMaterial);
  let width = 0;
  let height = 0;
  let pixelRatio = 0;

  return {
    render() {
      renderer.getSize(size);
      const ratio = renderer.getPixelRatio();
      if (width !== size.x || height !== size.y || pixelRatio !== ratio) {
        width = size.x; height = size.y; pixelRatio = ratio;
        composer.setPixelRatio(ratio);
        composer.setSize(width, height);
        ssr.ssrMaterial.defines.MAX_STEP = 48;
        ssr.ssrMaterial.needsUpdate = true;
      }
      receivers.length = 0;
      scene.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => material instanceof THREE.MeshStandardMaterial &&
            !material.transparent && material.userData.sceneReflection && material.roughness <= 0.95)) {
          receivers.push(object);
        }
      });
      ssr.ssrMaterial.uniforms.cameraNear.value = camera.near;
      ssr.ssrMaterial.uniforms.cameraFar.value = camera.far;
      ssr.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      ssr.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
      if (renderer.xr.isPresenting) {
        const target=renderer.getRenderTarget();
        const viewport=renderer.getViewport(new THREE.Vector4());
        const scissor=renderer.getScissor(new THREE.Vector4());
        const scissorTest=renderer.getScissorTest();
        const xrEnabled=renderer.xr.enabled;
        try {
          renderer.xr.enabled=false;
          composer.renderToScreen=false;
          composer.render();
          copyMaterial.uniforms.source.value=composer.readBuffer.texture;
          renderer.setRenderTarget(target);
          const view=renderer.xr.getCamera().cameras[0]?.viewport;
          if(view)renderer.setViewport(view);
          renderer.setScissorTest(false);
          copyQuad.render(renderer);
        } finally {
          renderer.setRenderTarget(target);
          renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
          renderer.xr.enabled=xrEnabled;
          composer.renderToScreen=true;
        }
      } else composer.render();
    },
    dispose() {
      ssr.dispose();
      ssr.ssrMaterial.dispose();
      output.dispose();
      composer.dispose();
      copyMaterial.dispose();copyQuad.dispose();
    },
  };
}
