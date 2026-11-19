import * as THREE from 'three';

const MAX_AXIS_CELLS = 80;
const MIN_CELL_METERS = 0.055;

/** Bake nearby geometry into a kitchen-local occupancy field shared by all cameras. */
export function bakeKitchenOcclusion(
  root: THREE.Group,
  sceneBounds: THREE.Box3,
  movingParts: Set<THREE.Object3D>,
): (() => void) | undefined {
  if (sceneBounds.isEmpty()) return;
  const bounds = sceneBounds.clone().expandByScalar(0.45);
  const span = bounds.getSize(new THREE.Vector3());
  const cell = Math.max(MIN_CELL_METERS, Math.max(span.x, span.y, span.z) / MAX_AXIS_CELLS);
  const nx = Math.ceil(span.x / cell);
  const ny = Math.ceil(span.y / cell);
  const nz = Math.ceil(span.z / cell);
  const density = new Uint8Array(nx * ny * nz);
  const toKitchen = new THREE.Matrix4();
  const materials = new Set<THREE.MeshStandardMaterial>();

  const localBox = new THREE.Box3();
  const sampleBox = new THREE.Box3();
  const inverse = new THREE.Matrix4();
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  const minimum = new THREE.Vector3();
  const maximum = new THREE.Vector3(nx - 1, ny - 1, nz - 1);
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();

  root.updateMatrixWorld(true);
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh) || node instanceof THREE.InstancedMesh) return;
    const meshMaterials = (Array.isArray(node.material) ? node.material : [node.material])
      .filter((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial);
    for (const material of meshMaterials) materials.add(material);
    const { kind } = node.userData;
    const floor = kind === 'floor';
    const solid = meshMaterials.some(material => !material.transparent && material.visible);
    if (!floor && (!solid || (!node.castShadow && kind !== 'shelf' && kind !== 'backsplash' && kind !== 'countertop'))) return;
    // Moving doors still receive AO, but cannot leave a stale shadow at the closed position.
    for (let ancestor: THREE.Object3D | null = node; ancestor && ancestor !== root; ancestor = ancestor.parent) {
      if (movingParts.has(ancestor)) return;
    }
    const geometry = node.geometry;
    if (!floor && geometry.type !== 'BoxGeometry' && geometry.type !== 'CylinderGeometry' &&
        geometry.type !== 'SphereGeometry' && kind !== 'countertop') return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) return;
    localBox.copy(geometry.boundingBox).expandByScalar(cell * 0.42);
    sampleBox.copy(localBox).applyMatrix4(node.matrixWorld);
    inverse.copy(node.matrixWorld).invert();
    from.copy(sampleBox.min).sub(bounds.min).divideScalar(cell).floor().max(minimum);
    to.copy(sampleBox.max).sub(bounds.min).divideScalar(cell).floor().min(maximum);
    for (let z = from.z; z <= to.z; z++) {
      for (let y = from.y; y <= to.y; y++) {
        for (let x = from.x; x <= to.x; x++) {
          const index = x + nx * (y + ny * z);
          if (density[index]) continue;
          center.set(x + 0.5, y + 0.5, z + 0.5).multiplyScalar(cell).add(bounds.min);
          if (localBox.containsPoint(point.copy(center).applyMatrix4(inverse))) density[index] = 255;
        }
      }
    }
  });

  const volume = new THREE.Data3DTexture(density, nx, ny, nz);
  volume.format = THREE.RedFormat;
  volume.minFilter = volume.magFilter = THREE.LinearFilter;
  volume.needsUpdate = true;
  root.userData.kitchenOcclusionTexture = volume;
  const invExtent = new THREE.Vector3(1 / (nx * cell), 1 / (ny * cell), 1 / (nz * cell));
  for (const material of materials) {
    const configureMaterial = material.onBeforeCompile.bind(material);
    const baseKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => baseKey + ':kitchen-occlusion-v1';
    material.onBeforeCompile = (shader, renderer) => {
      configureMaterial(shader, renderer);
      shader.uniforms.uKitchenFromWorld = { value: toKitchen };
      shader.uniforms.uKitchenOcclusion = { value: volume };
      shader.uniforms.uKitchenOcclusionOrigin = { value: bounds.min };
      shader.uniforms.uKitchenOcclusionInvExtent = { value: invExtent };
      shader.uniforms.uKitchenOcclusionStep = { value: Math.max(0.10, cell * 1.25) };
      const varyings = 'varying vec3 vKitchenPosition; varying vec3 vKitchenNormal;';
      shader.vertexShader = shader.vertexShader.replace('void main() {',
        varyings + '\nuniform mat4 uKitchenFromWorld;\nvoid main() {').replace('#include <project_vertex>', `
        #include <project_vertex>
        vKitchenPosition = (uKitchenFromWorld * modelMatrix * vec4(transformed, 1.0)).xyz;
        vKitchenNormal = mat3(uKitchenFromWorld) * transpose(mat3(viewMatrix)) * transformedNormal;
      `);
      shader.fragmentShader = shader.fragmentShader.replace('void main() {', varyings + `
        uniform highp sampler3D uKitchenOcclusion;
        uniform vec3 uKitchenOcclusionOrigin;
        uniform vec3 uKitchenOcclusionInvExtent;
        uniform float uKitchenOcclusionStep;
        float kitchenDensity(vec3 position) {
          vec3 uv = (position - uKitchenOcclusionOrigin) * uKitchenOcclusionInvExtent;
          if (any(lessThan(uv, vec3(0.0))) || any(greaterThan(uv, vec3(1.0)))) return 0.0;
          return texture(uKitchenOcclusion, uv).r;
        }
        void main() {
      `).replace('#include <opaque_fragment>', `
        vec3 nAO = normalize(vKitchenNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 tAO = normalize(cross(nAO, abs(nAO.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0)));
        vec3 bAO = cross(nAO, tAO);
        vec3 nearAO = vKitchenPosition + nAO * uKitchenOcclusionStep;
        float spreadAO = uKitchenOcclusionStep * 1.65;
        float occupiedAO = 2.0 * kitchenDensity(nearAO);
        occupiedAO += kitchenDensity(nearAO + tAO * spreadAO);
        occupiedAO += kitchenDensity(nearAO - tAO * spreadAO);
        occupiedAO += kitchenDensity(nearAO + bAO * spreadAO);
        occupiedAO += kitchenDensity(nearAO - bAO * spreadAO);
        occupiedAO += kitchenDensity(nearAO + nAO * spreadAO);
        outgoingLight *= 1.0 - (0.52 / 7.0) * occupiedAO;
        #include <opaque_fragment>
      `);
    };
  }

  return () => {
    root.updateWorldMatrix(true, false);
    toKitchen.copy(root.matrixWorld).invert();
  };
}
