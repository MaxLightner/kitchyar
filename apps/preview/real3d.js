/* Kitchyar PBR viewport. Geometry is derived from the independent metric scene. */
(function(root) {
  'use strict';
  const VERSION='0.168.0';
  const CDN='https://cdn.jsdelivr.net/npm/three@'+VERSION+'/';
  async function create(canvas, onStatus=()=>{}) {
    const container=canvas.parentElement;
    const host=document.createElement('div');
    host.className='pbr-surface';
    container.insertBefore(host,canvas);
    let alive=true,ready=false,THREE,scene,camera,webgl,composer,occlusion,world,environment;
    let items=[],mode='3d',selected=null,draft=null;
    const settings={azimuth:135,elevation:52,intensity:2.5,ao:.75,reflection:.75};
    let baseLight;
    try {
      const [mod,envMod,effectMod,renderMod,ssaoMod,outputMod]=await Promise.all([
        import(CDN+'build/three.module.js'),
        import(CDN+'examples/jsm/environments/RoomEnvironment.js'),
        import(CDN+'examples/jsm/postprocessing/EffectComposer.js'),
        import(CDN+'examples/jsm/postprocessing/RenderPass.js'),
        import(CDN+'examples/jsm/postprocessing/SSAOPass.js'),
        import(CDN+'examples/jsm/postprocessing/OutputPass.js')
      ]);
      if(!alive)return null;
      THREE=mod;scene=new THREE.Scene();
      scene.background=new THREE.Color('#e5eae3');
      camera=new THREE.OrthographicCamera(-5,5,5,-5,.01,100);
      webgl=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
      webgl.setPixelRatio(Math.min(root.devicePixelRatio||1,1.8));
      webgl.outputColorSpace=THREE.SRGBColorSpace;
      webgl.toneMapping=THREE.ACESFilmicToneMapping;
      webgl.toneMappingExposure=1.12;
      webgl.shadowMap.enabled=true;
      webgl.shadowMap.type=THREE.PCFSoftShadowMap;
      host.appendChild(webgl.domElement);
      const pmrem=new THREE.PMREMGenerator(webgl);
      environment=pmrem.fromScene(new envMod.RoomEnvironment(),.04).texture;
      pmrem.dispose();scene.environment=environment;
      const sky=new THREE.HemisphereLight('#eff8ff','#798478',1.5);scene.add(sky);
      const ambient=new THREE.AmbientLight('#eaf0e9',.25);scene.add(ambient);
      baseLight=new THREE.DirectionalLight('#fff6e7',settings.intensity);
      baseLight.castShadow=true;
      baseLight.shadow.mapSize.set(2048,2048);
      baseLight.shadow.camera.left=-11;baseLight.shadow.camera.right=11;
      baseLight.shadow.camera.top=11;baseLight.shadow.camera.bottom=-11;
      baseLight.shadow.camera.near=.1;baseLight.shadow.camera.far=40;
      baseLight.shadow.bias=-.0003;baseLight.shadow.normalBias=.018;
      scene.add(baseLight);scene.add(baseLight.target);
      world=new THREE.Group();scene.add(world);
      const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,50),
        new THREE.MeshStandardMaterial({color:'#e3e7df',roughness:.89,metalness:0}));
      floor.rotation.x=-Math.PI/2;floor.position.y=-.02;floor.receiveShadow=true;
      scene.add(floor);
      const grid=new THREE.GridHelper(24,48,'#bfcbbd','#d1d9cd');
      grid.position.y=-.012;
      grid.material.transparent=true;grid.material.opacity=.24;
      scene.add(grid);
      composer=new effectMod.EffectComposer(webgl);
      composer.addPass(new renderMod.RenderPass(scene,camera));
      occlusion=new ssaoMod.SSAOPass(scene,camera,1,1);
      occlusion.kernelRadius=12;
      occlusion.minDistance=.002;
      occlusion.maxDistance=.13;
      occlusion.output=ssaoMod.SSAOPass.OUTPUT.Default;
      composer.addPass(occlusion);
      composer.addPass(new outputMod.OutputPass());
      ready=true;onStatus('رندر PBR فعال: نور جهت‌دار، بازتاب محیطی و AO');
      redraw();
    }catch(err){
      host.remove();
      onStatus('WebGL / رندر پیشرفته در دسترس نیست؛ نمای ساده فعال ماند.');
      return null;
    }
    function mat(color,kind='wall') {
      if(kind==='cabinet')return new THREE.MeshPhysicalMaterial({
        color,metalness:.18,roughness:Math.max(.08,.4-settings.reflection*.31),
        clearcoat:.35+settings.reflection*.65,clearcoatRoughness:.1,
        envMapIntensity:.6+settings.reflection*1.2
      });
      if(kind==='glass')return new THREE.MeshPhysicalMaterial({
        color:'#c5ebf2',metalness:.08,roughness:.085,transparent:true,opacity:.43,
        transmission:.15,thickness:.014,side:THREE.DoubleSide,envMapIntensity:1.5
      });
      return new THREE.MeshStandardMaterial({color,roughness:kind==='wall'?.93:.67,metalness:0});
    }
    function addBox(parent,item,from,to,depth,bottom,height,material,normalOffset=0) {
      if(to-from<.003||height<.003)return;
      const len=Math.hypot(item.x2-item.x1,item.z2-item.z1)||1;
      const dx=(item.x2-item.x1)/len,dz=(item.z2-item.z1)/len;
      const n=-dz*(depth/2+normalOffset),m=dx*(depth/2+normalOffset);
      const x=item.x1+dx*(from+to)/2+n,z=item.z1+dz*(from+to)/2+m;
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(to-from,height,depth),material);
      mesh.position.set(x,bottom+height/2,z);
      mesh.rotation.y=-Math.atan2(dz,dx);
      mesh.castShadow=true;mesh.receiveShadow=true;
      parent.add(mesh);
      return mesh;
    }
    function addVolume(parent,item){
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(item.width,item.height,item.depth),
        mat(item.color,'cabinet'));
      mesh.position.set(item.x,item.height/2,item.z);mesh.castShadow=true;mesh.receiveShadow=true;
      parent.add(mesh);
    }
    function addRun(parent,item){
      const len=Math.hypot(item.x2-item.x1,item.z2-item.z1);
      const body=mat(item.color||'#dddcd6','cabinet');
      addBox(parent,item,0,len,item.depth,item.elevation,item.height,body);
      // A continuous lacquered cabinet run: seams are deliberately not fake unit divisions.
      const front=new THREE.MeshPhysicalMaterial({color:'#f3f1ea',metalness:.12,
        roughness:.16,clearcoat:.9,clearcoatRoughness:.09,envMapIntensity:1.5});
      addBox(parent,item,.015,len-.015,.018,item.elevation+.035,item.height-.07,front,item.depth+.002);
      if(item.runType==='base') {
        addBox(parent,item,0,len,item.depth+.035,item.elevation+item.height-.027,.038,
          mat('#d8d8d3','stone'));
        addBox(parent,item,.06,len-.06,item.depth-.12,0,.105,mat('#6f7976','stone'),.05);
      }
    }
    function addWall(parent,item,openings){
      const len=Math.hypot(item.x2-item.x1,item.z2-item.z1);
      const wallMat=mat(item.color||'#e8e9e4');
      let prev=0;
      for(const opening of openings) {
        const a=opening.offset-opening.width/2,b=opening.offset+opening.width/2;
        addBox(parent,item,prev,a,item.thickness,0,item.height,wallMat);
        addBox(parent,item,a,b,item.thickness,0,opening.sill,wallMat);
        addBox(parent,item,a,b,item.thickness,opening.sill+opening.height,
          item.height-opening.sill-opening.height,wallMat);
        prev=b;
      }
      addBox(parent,item,prev,len,item.thickness,0,item.height,wallMat);
      for(const op of openings) {
        const frame=mat(op.openingType==='door'?'#988c77':'#b5bdbc','stone');
        const a=op.offset-op.width/2,b=op.offset+op.width/2;
        if(op.openingType==='window'){
          addBox(parent,item,a,b,.026,op.sill+.045,op.height-.09,mat('#bce0e7','glass'),-.015);
          addBox(parent,item,a,b,.055,op.sill,.045,frame);
          addBox(parent,item,a,b,.055,op.sill+op.height-.045,.045,frame);
          addBox(parent,item,a,a+.048,.055,op.sill,op.height,frame);
          addBox(parent,item,b-.048,b,.055,op.sill,op.height,frame);
        }else {
          addBox(parent,item,a+.07,b-.04,.045,.035,op.height-.075,
            new THREE.MeshPhysicalMaterial({color:'#bcb1a2',roughness:.35,clearcoat:.28}));
        }
      }
    }
    function mark(parent,item) {
      const glow=new THREE.MeshBasicMaterial({color:'#49b989',depthTest:false});
      const points=item.kind==='opening'?[]:
        item.kind==='volume'?[[item.x,item.height+.07,item.z]]:
        [[item.x1,(item.elevation||0)+(item.height||0)+.09,item.z1],
         [item.x2,(item.elevation||0)+(item.height||0)+.09,item.z2]];
      for(const [x,y,z] of points) {
        const b=new THREE.Mesh(new THREE.SphereGeometry(.065,10,8),glow);
        b.position.set(x,y,z);b.renderOrder=3;parent.add(b);
      }
    }
    function rebuild(){
      if(!ready)return;
      while(world.children.length){
        const child=world.children[0];world.remove(child);
        child.traverse(m=>{
          m.geometry?.dispose();
          const arr=Array.isArray(m.material)?m.material:[m.material];
          for(const material of arr)if(material && !material.userData?.shared)material.dispose();
        });
      }
      const source=items.filter(i=>i.kind!=='opening');
      if(draft&&draft.a&&draft.b){
        const kind=draft.kind,wall=kind==='wall',upper=kind==='wall-cabinet';
        source.push({kind:wall?'wall':'cabinetRun',id:'preview',x1:draft.a.x,z1:draft.a.z,
          x2:draft.b.x,z2:draft.b.z,thickness:.15,depth:upper?.35:.6,
          height:wall?2.8:upper?.72:.85,elevation:upper?1.45:0,
          runType:upper?'wall':'base',color:'#8bb6a2'});
      }
      for(const item of source){
        const g=new THREE.Group();world.add(g);
        if(item.kind==='wall')addWall(g,item,items.filter(i=>i.kind==='opening'&&i.wallId===item.id)
          .sort((a,b)=>a.offset-b.offset));
        else if(item.kind==='cabinetRun')addRun(g,item);
        else if(item.kind==='volume')addVolume(g,item);
        if(item.id===selected)mark(g,item);
      }
      composer.render();
    }
    function resize() {
      if(!ready)return;
      const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);
      const scale=Math.max(28,Math.min(86,Math.min(w/9.2,h/5.6)));
      const worldPixel=scale*.78*Math.SQRT2;
      const elevation=Math.asin(.449);
      const targetY=.04*h/(worldPixel*Math.cos(elevation));
      const eyeHeight=13*Math.SQRT2*Math.tan(elevation);
      camera.position.set(13,targetY+eyeHeight,13);
      camera.lookAt(0,targetY,0);
      const halfW=w/worldPixel/2,halfH=h/worldPixel/2;
      camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;
      camera.updateProjectionMatrix();
      webgl.setSize(w,h,false);
      composer.setSize(w,h);
      occlusion.setSize(w,h);
      const rad=settings.azimuth*Math.PI/180,el=settings.elevation*Math.PI/180;
      baseLight.position.set(Math.cos(rad)*8,Math.sin(el)*13,Math.sin(rad)*8);
      baseLight.intensity=settings.intensity;
      occlusion.enabled=settings.ao>0;
      occlusion.kernelRadius=4+settings.ao*14;
    }
    function redraw(){
      if(!ready||!alive)return;
      const show=mode==='3d';
      host.style.display=show?'block':'none';
      canvas.style.opacity=show?'0':'1';
      if(!show)return;
      resize();rebuild();
    }
    const observer=new ResizeObserver(()=>{if(alive&&ready)redraw();});
    observer.observe(container);
    function render(nextItems,nextMode,nextSelected,nextDraft){
      items=nextItems||items;mode=nextMode||mode;selected=nextSelected;draft=nextDraft;
      if(ready)redraw();
    }
    function setLighting(next){
      Object.assign(settings,next);if(ready)redraw();
    }
    function dispose(){
      alive=false;observer.disconnect();canvas.style.opacity='1';
      if(!ready)return;
      while(world.children.length){
        const child=world.children[0];world.remove(child);
        child.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
      }
      environment?.dispose();composer?.dispose();webgl?.dispose();host.remove();
    }
    return {render,setLighting,dispose,isReady:()=>ready};
  }
  root.KitchyarReal3D={create};
})(window);
