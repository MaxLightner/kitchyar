// WebXR depths measure distance from the camera plane, not virtual scene geometry.
// Keep this pass outside the scaled/aligned kitchen group; only real depth writes it.
export const NEAR_OCCLUSION={limit:1,fade:.04,bias:.015,maxTextureSize:192};
export function nearDepthSessionOptions(root){
 return {requiredFeatures:['hit-test','dom-overlay'],optionalFeatures:['anchors','plane-detection','camera-access','light-estimation','depth-sensing'],domOverlay:{root},
  depthSensing:{usagePreference:['cpu-optimized','gpu-optimized'],dataFormatPreference:['float32','luminance-alpha'],matchDepthView:true}};
}
export const OCCLUSION_STATUS={idle:'برای نمایش دست، AR را فعال کن.',active:'نمایش اجسام واقعی تا یک متر فعال است.',waiting:'در انتظار عمق معتبر دوربین…',unsupported:'این دستگاه یا مرورگر عمق مناسب را در اختیار برنامه نمی‌گذارد.',disabled:'نمایش دست خاموش است.',wide:'نمایش دست در AR عادی فعال می‌شود؛ نمای واید تصویر واقعی دوربین ندارد.',paused:'نمایش دست فقط در حالت AR فعال است.'};

// Copy/downsample a current CPU frame; never retain the browser-owned buffer.
export function copyDepthFrame(info,format,reuse){
 const {width,height,rawValueToMeters:scale}=info||{};
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192||!Number.isFinite(scale)||scale<=0)return null;
 const bytes=format==='float32'?4:['luminance-alpha','unsigned-short'].includes(format)?2:0;
 if(!bytes||!info.data)return null;
 const source=ArrayBuffer.isView(info.data)?new DataView(info.data.buffer,info.data.byteOffset,info.data.byteLength):new DataView(info.data);
 if(source.byteLength<width*height*bytes)return null;
 const factor=Math.min(1,NEAR_OCCLUSION.maxTextureSize/Math.max(width,height)),w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
 const data=reuse?.length===w*h?reuse:new Float32Array(w*h);let valid=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sx=Math.min(width-1,Math.floor((x+.5)*width/w)),sy=Math.min(height-1,Math.floor((y+.5)*height/h)),offset=(sy*width+sx)*bytes;
  const raw=bytes===4?source.getFloat32(offset,true):source.getUint16(offset,true),depth=raw*scale;
  data[y*w+x]=Number.isFinite(depth)&&depth>0?depth:0;if(data[y*w+x]>0)valid++;
 }
 return {data,width:w,height:h,valid};
}

export const OCCLUSION_VERTEX='void main(){gl_Position=vec4(position.xy,0.0,1.0);}';
export const OCCLUSION_FRAGMENT=`
uniform sampler2D realDepth;
uniform mat4 depthFromView;
uniform mat4 inverseProjection;
uniform vec4 viewport;
uniform vec2 projectionDepth;
uniform float rawToMeters;
uniform float packedDepth;
uniform float maxDistance;
uniform float fadeDistance;
uniform float depthBias;
void main(){
 vec2 viewUV=vec2((gl_FragCoord.x-viewport.x)/viewport.z,1.0-(gl_FragCoord.y-viewport.y)/viewport.w);
 vec4 mapped=depthFromView*vec4(viewUV,0.0,1.0);
 if(abs(mapped.w)<.000001)discard;
 vec2 uv=mapped.xy/mapped.w;
 if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))discard;
 vec4 sampleDepth=texture2D(realDepth,uv);
 float realZ=(packedDepth>0.5?dot(sampleDepth.ra,vec2(255.0,65280.0)):sampleDepth.r)*rawToMeters;
 if(!(realZ>0.0))discard;
 vec4 ray=inverseProjection*vec4(viewUV.x*2.0-1.0,1.0-viewUV.y*2.0,1.0,1.0);
 float realDistance=realZ*length(ray.xyz)/abs(ray.z);
 if(!(realDistance<maxDistance))discard;
 float coverage=1.0-smoothstep(maxDistance-fadeDistance,maxDistance,realDistance);
 // Stable screen-space coverage near the one-metre boundary, without temporal ghosting.
 float threshold=fract(dot(mod(floor(gl_FragCoord.xy),4.0),vec2(.25,.5625))+.03125);
 if(coverage<threshold)discard;
 float z=realZ+depthBias;
 float deviceDepth=.5+.5*(-projectionDepth.x+projectionDepth.y/z);
 if(deviceDepth<0.0||deviceDepth>1.0)discard;
 gl_FragDepth=deviceDepth;
 gl_FragColor=vec4(0.0);
}`;

export class NearRealOcclusion{
 constructor(THREE,scene){this.T=THREE;this.scene=scene;this.status='idle';this.mesh=null;this.texture=null;this.kind=null;}
 hide(status='waiting'){if(this.mesh)this.mesh.visible=false;this.status=status;}
 ensurePass(){
  if(this.mesh)return;
  const T=this.T;
  const uniforms={realDepth:{value:null},depthFromView:{value:new T.Matrix4()},inverseProjection:{value:new T.Matrix4()},viewport:{value:new T.Vector4(0,0,1,1)},projectionDepth:{value:new T.Vector2()},rawToMeters:{value:1},packedDepth:{value:0},maxDistance:{value:NEAR_OCCLUSION.limit},fadeDistance:{value:NEAR_OCCLUSION.fade},depthBias:{value:NEAR_OCCLUSION.bias}};
  const material=new T.ShaderMaterial({uniforms,vertexShader:OCCLUSION_VERTEX,fragmentShader:OCCLUSION_FRAGMENT,colorWrite:false,depthTest:true,depthFunc:T.AlwaysDepth,depthWrite:true,blending:T.NoBlending,toneMapped:false});
  this.mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);this.mesh.frustumCulled=false;this.mesh.renderOrder=-1000000;this.mesh.visible=false;this.mesh.name='near-real-depth-only';
  this.mesh.onBeforeRender=(renderer,scene,camera)=>{
   const u=material.uniforms,e=camera.projectionMatrix.elements;
   u.projectionDepth.value.set(e[10],e[14]);u.inverseProjection.value.copy(camera.projectionMatrix).invert();
   if(camera.viewport)u.viewport.value.copy(camera.viewport);else renderer.getCurrentViewport(u.viewport.value);
  };
  this.scene.add(this.mesh);
 }
 update(frame,pose,renderer,session,{enabled=true,ar=true,wide=false}={}){
  this.hide();
  // Disable Three's unbounded automatic occlusion. Our one-metre pass owns this depth buffer.
  const native=renderer?.xr?.getDepthSensingMesh?.();if(native)native.visible=false;
  if(!enabled){this.status='disabled';return;}
  if(!ar){this.status='paused';return;}
  if(wide){this.status='wide';return;}
  if(!['cpu-optimized','gpu-optimized'].includes(session?.depthUsage)){this.status='unsupported';return;}
  if(session.depthActive===false||!pose?.views?.length)return;
  // The current product uses a single handheld camera, not stereo headset views.
  if(pose.views.length!==1){this.status='unsupported';return;}
  try{
   const cpu=session.depthUsage==='cpu-optimized',info=cpu?frame.getDepthInformation?.(pose.views[0]):renderer.xr.getBinding?.()?.getDepthInformation(pose.views[0]);
   if(!info||info.isValid===false)return;
   const matrix=info.normDepthBufferFromNormView?.matrix;
   if(!matrix||matrix.length!==16||!Array.from(matrix).every(Number.isFinite))return;
   if(cpu){
    const copied=copyDepthFrame(info,session.depthDataFormat,this.cpuData);if(!copied||!copied.valid)return;
    this.cpuData=copied.data;
    if(this.kind!=='cpu'||this.texture?.image.width!==copied.width||this.texture?.image.height!==copied.height){
     this.texture?.dispose();this.texture=new this.T.DataTexture(copied.data,copied.width,copied.height,this.T.RedFormat,this.T.FloatType);this.texture.minFilter=this.texture.magFilter=this.T.NearestFilter;this.texture.generateMipmaps=false;this.texture.flipY=false;this.kind='cpu';
    }else this.texture.image.data=copied.data;
    this.texture.needsUpdate=true;
   }else{
    // A raw 2D GPU texture can be sampled directly. Array/normalized-depth variants fail open.
    if(!info.texture||info.textureType&&info.textureType!=='texture'||!['float32','luminance-alpha'].includes(session.depthDataFormat)||!Number.isFinite(info.rawValueToMeters)||!(info.rawValueToMeters>0)){
     this.status='unsupported';return;
    }
    if(this.kind!=='gpu'){this.texture?.dispose();this.texture=new this.T.ExternalTexture(info.texture);this.kind='gpu';}else this.texture.sourceTexture=info.texture;
   }
   this.ensurePass();const u=this.mesh.material.uniforms;
   u.realDepth.value=this.texture;u.depthFromView.value.fromArray(matrix);u.rawToMeters.value=cpu?1:info.rawValueToMeters;u.packedDepth.value=!cpu&&session.depthDataFormat==='luminance-alpha'?1:0;
   this.mesh.visible=true;this.status='active';
  }catch{this.hide('waiting');}
 }
 dispose(){this.mesh?.removeFromParent();this.mesh?.geometry.dispose();this.mesh?.material.dispose();this.texture?.dispose();this.mesh=null;this.texture=null;this.cpuData=null;this.kind=null;this.status='idle';}
}
