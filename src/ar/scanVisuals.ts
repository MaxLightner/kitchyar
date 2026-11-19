import * as THREE from 'three';
// Direct geometry/shader port of Chido Studio.floorNet (2026-11-16).
// The grid is a 6m square with 24 cells; radius/pulse are expanded on confirm.
export function createFloorNetMesh(): {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uCenter: { value: THREE.Vector2 };
    uOpacity: { value: number };
    uReveal: { value: number };
    uPulse: { value: number };
  };
} {
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uOpacity: { value: 0.85 },
    uReveal: { value: 0.65 },
    uPulse: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 gridUv;
      void main() {
        gridUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `precision highp float;
      varying vec2 gridUv;
      uniform float uOpacity;
      uniform float uReveal;
      uniform float uPulse;
      void main() {
        vec2 cells = gridUv * 24.0;
        vec2 dx = max(fwidth(cells), vec2(0.0001));
        vec2 line = abs(fract(cells + 0.5) - 0.5) / dx;
        float px = min(line.x, line.y);
        float core = 1.0 - smoothstep(0.7, 1.65, px);
        float glow = 1.0 - smoothstep(1.2, 5.2, px);
        float radius = length((gridUv - 0.5) * 6.0);
        float edge = 1.0 - smoothstep(uReveal - 0.06, uReveal + 0.06, radius);
        float rim = (1.0 - smoothstep(0.025, 0.11, abs(radius - uReveal))) *
          (1.0 - step(2.95, uReveal));
        float alpha = clamp((0.72 * core + 0.32 * glow) * uOpacity * edge +
          rim * 0.65 * uPulse, 0.0, 0.95);
        gl_FragColor = vec4(
          mix(vec3(0.20,0.57,0.52), vec3(0.55,0.97,0.83), max(core,rim)), alpha);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(6, 6);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.visible = false;
  return {mesh, uniforms};
}

// Chido Studio.scanCrosses: 32mm crossed line segments, not filled quads.
export function createCrossMarker(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.016, 0, -0.016),
    new THREE.Vector3(0.016, 0, 0.016),
    new THREE.Vector3(-0.016, 0, 0.016),
    new THREE.Vector3(0.016, 0, -0.016),
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0x83ffe3, transparent: true, opacity: 0.94, depthTest: false,
  });
  const cross = new THREE.LineSegments(geometry, material);
  cross.renderOrder = 10;
  group.add(cross);
  group.userData.mat = material;
  group.visible = false;
  return group;
}

