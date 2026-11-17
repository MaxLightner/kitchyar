import * as THREE from 'three';

export const NEAR_OCCLUSION = { limit: 1, fade: 0.04, bias: 0.015, maxTextureSize: 192 };

export function nearDepthSessionOptions(root: HTMLElement): XRSessionInit {
  return {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: [
      'anchors',
      'plane-detection',
      'camera-access',
      'light-estimation',
      'depth-sensing',
    ],
    domOverlay: { root },
    depthSensing: {
      usagePreference: ['cpu-optimized', 'gpu-optimized'],
      dataFormatPreference: ['float32', 'luminance-alpha'],
    },
  } as XRSessionInit;
}

export type OcclusionStatus =
  | 'idle'
  | 'active'
  | 'waiting'
  | 'unsupported'
  | 'disabled'
  | 'wide'
  | 'paused';

export const OCCLUSION_STATUS_LABEL: Record<OcclusionStatus, string> = {
  idle: 'برای نمایش دست، AR را فعال کنید.',
  active: 'نمایش اجسام واقعی تا ۱ متر فعال است.',
  waiting: 'در انتظار عمق معتبر دوربین…',
  unsupported: 'مرورگر عمق مناسب را در اختیار برنامه نمی‌گذارد.',
  disabled: 'نمایش دست خاموش است.',
  wide: 'نمایش دست در AR عادی فعال می‌شود.',
  paused: 'نمایش دست در حالت ۲D/۳D موقتاً متوقف است.',
};

const OCCLUSION_VERTEX = 'void main(){gl_Position=vec4(position.xy,0.0,1.0);}';
const OCCLUSION_FRAGMENT = `uniform sampler2D realDepth;uniform mat4 depthFromView;uniform mat4 inverseProjection;uniform vec4 viewport;uniform vec2 projectionDepth;uniform float rawToMeters;uniform float packedDepth;uniform float maxDistance;uniform float fadeDistance;uniform float depthBias;void main(){ vec2 viewUV=vec2((gl_FragCoord.x-viewport.x)/viewport.z,1.0-(gl_FragCoord.y-viewport.y)/viewport.w); vec4 mapped=depthFromView*vec4(viewUV,0.0,1.0); if(abs(mapped.w)<.000001)discard; vec2 uv=mapped.xy/mapped.w; if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))discard; vec4 sampleDepth=texture2D(realDepth,uv); float realZ=(packedDepth>0.5?dot(sampleDepth.ra,vec2(255.0,65280.0)):sampleDepth.r)*rawToMeters; if(!(realZ>0.0))discard; vec4 ray=inverseProjection*vec4(viewUV.x*2.0-1.0,1.0-viewUV.y*2.0,1.0,1.0); float realDistance=realZ*length(ray.xyz)/abs(ray.z); if(!(realDistance<maxDistance))discard; float coverage=1.0-smoothstep(maxDistance-fadeDistance,maxDistance,realDistance); float threshold=fract(dot(mod(floor(gl_FragCoord.xy),4.0),vec2(.25,.5625))+.03125); if(coverage<threshold)discard; float z=realZ+depthBias; float deviceDepth=.5+.5*(-projectionDepth.x+projectionDepth.y/z); if(deviceDepth<0.0||deviceDepth>1.0)discard; gl_FragDepth=deviceDepth; gl_FragColor=vec4(0.0);}`;

function copyDepthFrame(
  info: XRCPUDepthInformation,
  format: string | undefined,
  reuse?: Float32Array
) {
  const { width, height, rawValueToMeters: scale } = info || {};
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    !Number.isFinite(scale) ||
    scale <= 0
  ) {
    return null;
  }
  const bytes =
    format === 'float32'
      ? 4
      : format === 'luminance-alpha' || format === 'unsigned-short'
      ? 2
      : 0;
  if (!bytes || !info.data) return null;
  const source = ArrayBuffer.isView(info.data)
    ? new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength)
    : new DataView(info.data);
  if (source.byteLength < width * height * bytes) return null;

  const factor = Math.min(1, NEAR_OCCLUSION.maxTextureSize / Math.max(width, height));
  const w = Math.max(1, Math.round(width * factor));
  const h = Math.max(1, Math.round(height * factor));
  const data = reuse?.length === w * h ? reuse : new Float32Array(w * h);
  let valid = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / w));
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / h));
      const offset = (sy * width + sx) * bytes;
      const raw =
        bytes === 4 ? source.getFloat32(offset, true) : source.getUint16(offset, true);
      const depth = raw * scale;
      data[y * w + x] = Number.isFinite(depth) && depth > 0 ? depth : 0;
      if (data[y * w + x] > 0) valid++;
    }
  }
  return { data, width: w, height: h, valid };
}

export class NearRealOcclusion {
  private scene: THREE.Scene;
  status: OcclusionStatus = 'idle';
  private mesh: THREE.Mesh | null = null;
  private texture: THREE.DataTexture | THREE.ExternalTexture | null = null;
  private kind: 'cpu' | 'gpu' | null = null;
  private cpuData: Float32Array | undefined = undefined;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  hide(status: OcclusionStatus = 'waiting') {
    if (this.mesh) this.mesh.visible = false;
    this.status = status;
  }

  private ensurePass() {
    if (this.mesh) return;
    const uniforms = {
      realDepth: { value: null as THREE.Texture | null },
      depthFromView: { value: new THREE.Matrix4() },
      inverseProjection: { value: new THREE.Matrix4() },
      viewport: { value: new THREE.Vector4(0, 0, 1, 1) },
      projectionDepth: { value: new THREE.Vector2() },
      rawToMeters: { value: 1 },
      packedDepth: { value: 0 },
      maxDistance: { value: NEAR_OCCLUSION.limit },
      fadeDistance: { value: NEAR_OCCLUSION.fade },
      depthBias: { value: NEAR_OCCLUSION.bias },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: OCCLUSION_VERTEX,
      fragmentShader: OCCLUSION_FRAGMENT,
      colorWrite: false,
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000000;
    this.mesh.visible = false;
    this.mesh.name = 'near-real-depth-only';
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const u = material.uniforms;
      const e = camera.projectionMatrix.elements;
      u.projectionDepth.value.set(e[10], e[14]);
      u.inverseProjection.value.copy(camera.projectionMatrix).invert();
      renderer.getCurrentViewport(u.viewport.value);
    };
    this.scene.add(this.mesh);
  }

  update(
    frame: XRFrame,
    pose: XRViewerPose | undefined,
    renderer: THREE.WebGLRenderer,
    session: XRSession,
    opts: { enabled?: boolean; ar?: boolean } = {}
  ) {
    this.hide();
    const nativeMesh = (renderer.xr as unknown as { getDepthSensingMesh?: () => THREE.Object3D | null }).getDepthSensingMesh?.();
    if (nativeMesh) nativeMesh.visible = false;

    if (!opts.enabled) {
      this.status = 'disabled';
      return;
    }
    if (!opts.ar) {
      this.status = 'paused';
      return;
    }
    const xrSessionAny = session as unknown as {
      depthUsage?: string;
      depthActive?: boolean;
      depthDataFormat?: string;
    };
    if (xrSessionAny.depthUsage !== 'cpu-optimized' && xrSessionAny.depthUsage !== 'gpu-optimized') {
      this.status = 'unsupported';
      return;
    }
    if (xrSessionAny.depthActive === false || !pose?.views?.length || pose.views.length !== 1) {
      return;
    }

    try {
      const cpu = xrSessionAny.depthUsage === 'cpu-optimized';
      const frameAny = frame as unknown as {
        getDepthInformation?: (v: XRView) => XRCPUDepthInformation | null;
      };
      const xrAny = renderer.xr as unknown as {
        getBinding?: () => {
          getDepthInformation?: (v: XRView) => {
            isValid?: boolean;
            normDepthBufferFromNormView?: { matrix: Float32Array };
            texture?: WebGLTexture;
            textureType?: string;
            rawValueToMeters?: number;
          } | null;
        };
      };

      if (cpu) {
        const info = frameAny.getDepthInformation?.(pose.views[0]);
        if (!info) return;
        const matrix = info.normDepthBufferFromNormView?.matrix;
        if (!matrix || matrix.length !== 16) return;
        const copied = copyDepthFrame(info, xrSessionAny.depthDataFormat, this.cpuData);
        if (!copied || !copied.valid) return;
        this.cpuData = copied.data;
        if (
          this.kind !== 'cpu' ||
          !(this.texture instanceof THREE.DataTexture) ||
          this.texture.image.width !== copied.width ||
          this.texture.image.height !== copied.height
        ) {
          this.texture?.dispose();
          this.texture = new THREE.DataTexture(
            copied.data,
            copied.width,
            copied.height,
            THREE.RedFormat,
            THREE.FloatType
          );
          this.texture.minFilter = THREE.NearestFilter;
          this.texture.magFilter = THREE.NearestFilter;
          this.texture.generateMipmaps = false;
          this.texture.flipY = false;
          this.kind = 'cpu';
        } else {
          this.texture.image.data = copied.data;
        }
        this.texture.needsUpdate = true;
        this.ensurePass();
        const u = (this.mesh!.material as THREE.ShaderMaterial).uniforms;
        u.realDepth.value = this.texture;
        u.depthFromView.value.fromArray(matrix);
        u.rawToMeters.value = 1;
        u.packedDepth.value = 0;
        this.mesh!.visible = true;
        this.status = 'active';
      } else {
        const info = xrAny.getBinding?.()?.getDepthInformation?.(pose.views[0]);
        if (!info || info.isValid === false) return;
        const matrix = info.normDepthBufferFromNormView?.matrix;
        if (
          !matrix ||
          matrix.length !== 16 ||
          !info.texture ||
          (info.textureType && info.textureType !== 'texture') ||
          !Number.isFinite(info.rawValueToMeters) ||
          !(info.rawValueToMeters! > 0)
        ) {
          this.status = 'unsupported';
          return;
        }
        if (this.kind !== 'gpu') {
          this.texture?.dispose();
          this.texture = new THREE.ExternalTexture(info.texture);
          this.kind = 'gpu';
        } else if (this.texture instanceof THREE.ExternalTexture) {
          this.texture.sourceTexture = info.texture;
        }
        this.ensurePass();
        const u = (this.mesh!.material as THREE.ShaderMaterial).uniforms;
        u.realDepth.value = this.texture;
        u.depthFromView.value.fromArray(matrix);
        u.rawToMeters.value = info.rawValueToMeters!;
        u.packedDepth.value = xrSessionAny.depthDataFormat === 'luminance-alpha' ? 1 : 0;
        this.mesh!.visible = true;
        this.status = 'active';
      }
    } catch {
      this.hide('waiting');
    }
  }

  dispose() {
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material | undefined)?.dispose();
    this.texture?.dispose();
    this.mesh = null;
    this.texture = null;
    this.cpuData = undefined;
    this.kind = null;
    this.status = 'idle';
  }
}
