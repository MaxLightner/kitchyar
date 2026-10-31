/* WebXR floor hit-test adapter. Requires Android Chrome/ARCore, HTTPS, and DOM Overlay.
 * Engineering dimensions stay in meters in core.js; XR transforms are session-local. */
(function(root) {
  'use strict';
  const CDN='https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js';
  async function start(model,onExit=()=>{},notify=()=>{},onSceneChange=()=>{}) {
    if(!navigator.xr||!root.isSecureContext)
      throw Error('برای AR به مرورگر سازگار، دوربین و اتصال HTTPS نیاز است.');
    // requestSession is made before imports so it retains the click's user activation.
    const overlay=document.createElement('div');
    overlay.className='xr-overlay';
    overlay.innerHTML=`<div class="xr-top"><button id="xr-menu">منوی کیچیار</button><span id="xr-status">در حال جستجوی کف...</span><button id="xr-close">خروج ×</button></div><section class="xr-menu-sheet" id="xr-menu-sheet" hidden><strong>KITCHYAR · AR</strong><p>ثبت و ذخیره طرح از همین محیط انجام می‌شود؛ خروج، پروژه را پاک نمی‌کند.</p><button id="xr-reset-floor">اسکن مجدد کف</button><button id="xr-menu-exit">خروج از AR</button></section>
      <div class="xr-bottom"><div class="xr-scan-readiness" id="xr-scan-readiness"><div><strong>آمادگی شناسایی کف</strong><span id="xr-scan-percent">۰٪</span></div><progress id="xr-scan-progress" max="5" value="0"></progress><small>۵ نمونه معتبر در نقاط مختلف کف؛ این درصد پیشرفت داخلی اسکن است، نه درصد ARCore.</small></div><div class="xr-steps">۱. دوربین را آرام روی نقاط مختلف کف حرکت دهید. ۲. بعد از پنج نمونه معتبر کف را تأیید کنید. ۳. A/B را اندازه بگیرید.</div>
      <div class="xr-buttons"><button id="xr-confirm" disabled>تأیید کف</button><button id="xr-a" disabled>ثبت A</button><button id="xr-b" disabled>ثبت B</button></div>
      <label>فاصله واقعی A تا B (متر) <input id="xr-distance" type="number" min=".1" max="20" step=".01" value="${model.calibration?.baselineMeters||1}"></label>
      <div class="xr-buttons"><button id="xr-apply" disabled>تصحیح مقیاس AR</button><button id="xr-left" disabled>چرخش −۵°</button><button id="xr-right" disabled>چرخش +۵°</button></div>
      <div class="xr-build"><label>ترسیم در AR <select id="xr-tool"><option value="wall">دیوار</option><option value="base">کابینت زمینی</option><option value="wall-cabinet">کابینت هوایی</option><option value="window">پنجره روی دیوار</option><option value="door">در روی دیوار</option></select></label>
      <div class="xr-buttons"><button id="xr-start-point" disabled>ثبت نقطه شروع</button><button id="xr-end-point" disabled>ثبت انتها / بازشو</button></div></div></div>`;
    document.body.appendChild(overlay);
    let session;
    try{
      session=await navigator.xr.requestSession('immersive-ar',{
        requiredFeatures:['hit-test','dom-overlay'],
        optionalFeatures:['local-floor'],
        domOverlay:{root:overlay}
      });
    }catch(error){overlay.remove();throw Error('شروع AR ممکن نشد: '+error.message);}
    let renderer,hitSource,reference,viewer,cleaned=false,currentHit=null,floorConfirmed=false;
    let anchor=null,pointA=null,pointB=null,displayScale=1,startPoint=null,scanSamples=[],lastScanAt=0,scanMarkers=[];
    let syncScan=()=>{};
    const status=overlay.querySelector('#xr-status'),btn=n=>overlay.querySelector('#xr-'+n);
    const updateStatus=s=>{if(status.textContent!==s)status.textContent=s;};
    function clean(){
      if(cleaned)return;cleaned=true;
      renderer?.setAnimationLoop(null);renderer?.dispose();renderer?.domElement.remove();
      hitSource?.cancel();overlay.remove();onExit();
    }
    session.addEventListener('end',clean,{once:true});
    btn('close').onclick=()=>session.end();
    btn('menu').onclick=()=>{const sheet=btn('menu-sheet');sheet.hidden=!sheet.hidden;};
    btn('menu-exit').onclick=()=>session.end();
    btn('reset-floor').onclick=()=>{scanSamples=[];lastScanAt=0;floorConfirmed=false;anchor=null;pointA=null;pointB=null;startPoint=null;displayScale=1;btn('confirm').disabled=true;btn('menu-sheet').hidden=true;btn('scan-readiness').hidden=false;rootGroup.visible=false;['a','b','left','right','start-point','end-point','apply'].forEach(k=>btn(k).disabled=true);syncScan();updateStatus('اسکن مجدد: گوشی را روی نقاط مختلف کف حرکت دهید.');};
    try{
      const THREE=await import(CDN);
      const scene=new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff,0x687b75,2.1));
      const light=new THREE.DirectionalLight(0xffffff,1.3);light.position.set(3,6,2);scene.add(light);
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});
      renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,2));renderer.setSize(root.innerWidth,root.innerHeight);
      renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');
      renderer.domElement.className='xr-surface';document.body.appendChild(renderer.domElement);
      await renderer.xr.setSession(session);
      reference=renderer.xr.getReferenceSpace();
      viewer=await session.requestReferenceSpace('viewer');
      hitSource=await session.requestHitTestSource({space:viewer});
      const camera=new THREE.PerspectiveCamera();
      const rootGroup=new THREE.Group();scene.add(rootGroup);rootGroup.visible=false;
      const modelGroup=new THREE.Group();rootGroup.add(modelGroup);
      const grid=new THREE.GridHelper(8,80,0x629371,0xa4b6a5);
      grid.material.opacity=.31;grid.material.transparent=true;grid.material.depthWrite=false;
      rootGroup.add(grid);
      const ring=new THREE.Mesh(new THREE.RingGeometry(.11,.15,36),
        new THREE.MeshBasicMaterial({color:0x4fba89,side:THREE.DoubleSide,transparent:true,opacity:.85}));
      ring.rotation.x=-Math.PI/2;scene.add(ring);ring.visible=false;
      const sampleGeo=new THREE.SphereGeometry(.028,10,8);
      const sampleMat=new THREE.MeshBasicMaterial({color:'#ffcc79',depthTest:false});
      syncScan=function(){
        while(scanMarkers.length){const m=scanMarkers.pop();scene.remove(m);}
        for(const p of scanSamples){const m=new THREE.Mesh(sampleGeo,sampleMat);m.position.set(p.x,p.y+.025,p.z);scene.add(m);scanMarkers.push(m);}
        btn('scan-progress').value=scanSamples.length;
        btn('scan-percent').textContent=Math.round(scanSamples.length/5*100)+'٪';
      }
      const colors={wall:'#d6dfd0',base:'#8faaa0',wallCabinet:'#a7bda6'};
      function material(color,opacity=1){
        return new THREE.MeshStandardMaterial({color,roughness:.8,transparent:opacity<1,opacity,side:THREE.DoubleSide});
      }
      function along(item,t,normal=0){
        const l=Math.hypot(item.x2-item.x1,item.z2-item.z1)||1;
        return {x:item.x1+(item.x2-item.x1)*t/l-(item.z2-item.z1)*normal/l,
          z:item.z1+(item.z2-item.z1)*t/l+(item.x2-item.x1)*normal/l};
      }
      function block(item,from,to,depth,bottom,height,color){
        if(to-from<.002||height<.002)return;
        const a=along(item,from,depth/2),b=along(item,to,depth/2);
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(to-from,height,depth),material(color));
        mesh.position.set((a.x+b.x)/2,bottom+height/2,(a.z+b.z)/2);
        mesh.rotation.y=-Math.atan2(item.z2-item.z1,item.x2-item.x1);
        modelGroup.add(mesh);
      }
      function rebuildModel(){
      while(modelGroup.children.length){
        const mesh=modelGroup.children[0];modelGroup.remove(mesh);
        mesh.geometry?.dispose();mesh.material?.dispose();
      }
      for(const item of model.items){
        if(item.kind==='wall'){
          const len=Math.hypot(item.x2-item.x1,item.z2-item.z1);
          const openings=model.items.filter(i=>i.kind==='opening'&&i.wallId===item.id).sort((a,b)=>a.offset-b.offset);
          let prev=0;
          for(const op of openings){
            const a=op.offset-op.width/2,b=op.offset+op.width/2;
            block(item,prev,a,item.thickness,0,item.height,item.color||colors.wall);
            block(item,a,b,item.thickness,0,op.sill,item.color||colors.wall);
            block(item,a,b,item.thickness,op.sill+op.height,item.height-op.sill-op.height,item.color||colors.wall);
            prev=b;
          }
          block(item,prev,len,item.thickness,0,item.height,item.color||colors.wall);
        }else if(item.kind==='cabinetRun'){
          const len=Math.hypot(item.x2-item.x1,item.z2-item.z1);
          block(item,0,len,item.depth,item.elevation,item.height,item.color||colors[item.runType==='wall'?'wallCabinet':'base']);
        }else if(item.kind==='volume'){
          const mesh=new THREE.Mesh(new THREE.BoxGeometry(item.width,item.height,item.depth),material(item.color));
          mesh.position.set(item.x,item.height/2,item.z);modelGroup.add(mesh);
        }else if(item.kind==='opening'){
          const wall=model.items.find(w=>w.id===item.wallId);if(!wall)continue;
          const p=along(wall,item.offset);
          const mesh=new THREE.Mesh(new THREE.BoxGeometry(item.width,item.height,.025),
            material(item.color||'#8ab0bb',item.openingType==='door'?.9:.48));
          mesh.position.set(p.x,item.sill+item.height/2,p.z);
          mesh.rotation.y=-Math.atan2(wall.z2-wall.z1,wall.x2-wall.x1);
          modelGroup.add(mesh);
        }
      }
      }
      rebuildModel();
      const posePoint=()=>{
        if(!currentHit)return null;
        return currentHit.position.clone();
      };
      btn('confirm').onclick=()=>{
        const p=posePoint();if(!p)return;
        if(scanSamples.length<5)return notify('برای تثبیت کف، پنج نقطه معتبر ثبت کنید.');
        anchor=p;anchor.y=scanSamples.reduce((v,q)=>v+q.y,0)/scanSamples.length;
        rootGroup.position.copy(anchor);rootGroup.rotation.y=(model.calibration?.rotation||0)*Math.PI/180;
        rootGroup.visible=true;floorConfirmed=true;
        ['a','b','left','right','start-point','end-point'].forEach(k=>btn(k).disabled=false);
        scanSamples=[];syncScan();btn('scan-readiness').hidden=true;
        updateStatus('کف با ۵ نمونه تأیید شد · مقیاس اولیه ۱:۱');
      };
      btn('a').onclick=()=>{
        pointA=posePoint();pointB=null;btn('apply').disabled=true;
        notify('نقطه A ثبت شد. به سمت نقطه B حرکت کنید.');
      };
      btn('b').onclick=()=>{
        if(!pointA)return notify('ابتدا نقطه A را ثبت کنید.');
        pointB=posePoint();if(!pointB)return;
        const measured=pointA.distanceTo(pointB);
        if(measured<.1){pointB=null;return notify('فاصله دو نقطه کمتر از ۱۰ سانتی‌متر است.');}
        btn('apply').disabled=false;updateStatus('فاصله ردیابی‌شده: '+measured.toFixed(3)+' متر');
      };
      btn('apply').onclick=()=>{
        if(!pointA||!pointB)return;
        const real=Number(btn('distance').value),measured=pointA.distanceTo(pointB);
        if(!Number.isFinite(real)||real<.1||real>20)return notify('فاصله واقعی معتبر وارد کنید.');
        const ratio=real/measured;
        if(ratio<.8||ratio>1.2)return notify('اختلاف بیش از ۲۰٪ است؛ A/B را دوباره اندازه‌گیری کنید.');
        displayScale=ratio;rootGroup.scale.setScalar(displayScale);
        updateStatus('مقیاس نمایش AR: '+displayScale.toFixed(3)+' · ابعاد پروژه بدون تغییر');
        notify('تصحیح نمایش AR انجام شد؛ مدل مهندسی تغییر نکرد.');
      };
      btn('left').onclick=()=>rootGroup.rotation.y-=Math.PI/36;
      btn('right').onclick=()=>rootGroup.rotation.y+=Math.PI/36;
      function metricPoint(){
        const p=posePoint();if(!p||!floorConfirmed)return null;
        p.sub(rootGroup.position);p.applyAxisAngle(new THREE.Vector3(0,1,0),-rootGroup.rotation.y);
        p.divideScalar(displayScale);
        return {x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100};
      }
      btn('start-point').onclick=()=>{
        const p=metricPoint();if(!p)return notify('ابتدا کف را تأیید کنید و روی سطح معتبر نشانه بروید.');
        startPoint=p;updateStatus('نقطه آغاز ثبت شد: '+p.x+', '+p.z+' متر');
      };
      btn('end-point').onclick=()=>{
        const p=metricPoint(),kind=btn('tool').value;
        if(!p)return notify('نقطه انتها روی سطح معتبر پیدا نشد.');
        const Core=root.KitchyarCore;
        let item;
        if(kind==='window'||kind==='door'){
          const wall=model.items.filter(i=>i.kind==='wall').map(w=>{
            const dx=w.x2-w.x1,dz=w.z2-w.z1,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(l,((p.x-w.x1)*dx+(p.z-w.z1)*dz)/l));
            const x=w.x1+dx*t/l,z=w.z1+dz*t/l;
            return {wall:w,offset:t,distance:Math.hypot(p.x-x,p.z-z)};
          }).sort((a,b)=>a.distance-b.distance)[0];
          if(!wall||wall.distance>.6)return notify('برای بازشو نزدیک امتداد یک دیوار نشانه بروید.');
          item=Core.createOpening(wall.wall,kind,wall.offset);
          const edge=item.width/2+.08;
          item.offset=Math.max(edge,Math.min(Core.length(wall.wall)-edge,wall.offset));
        }else{
          if(!startPoint)return notify('ابتدا نقطه شروع را ثبت کنید.');
          if(Math.hypot(startPoint.x-p.x,startPoint.z-p.z)<.3)return notify('طول حداقل ۳۰ سانتی‌متر است.');
          item=kind==='wall'?Core.createWall(startPoint,p):Core.createCabinetRun(startPoint,p,kind==='base'?'base':'wall');
        }
        const previous=Core.copy(model.items);
        model.items.push(item);
        try{
          Core.validateScene(Core.normalizeScene(model));
          onSceneChange(model,previous);
          rebuildModel();startPoint=null;
          notify(kind==='window'||kind==='door'?'بازشو در پروژه ذخیره شد.':'حجم پیوسته به پروژه اضافه شد.');
        }catch(error){model.items=previous;notify(error.message);}
      };
      renderer.setAnimationLoop((time,frame)=>{
        if(!frame)return;
        const viewerPose=frame.getViewerPose(reference);
        if(!viewerPose){currentHit=null;ring.visible=false;btn('confirm').disabled=true;
          updateStatus('ردیابی دوربین از دست رفته؛ ثبت نقطه متوقف شد.');return;}
        const hits=frame.getHitTestResults(hitSource);
        if(hits.length){
          const pose=hits[0].getPose(reference);
          const point=pose?new THREE.Vector3(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z):null;
          const orientation=pose?.transform.orientation;
          const normal=orientation?new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(orientation.x,orientation.y,orientation.z,orientation.w)):null;
          const cameraY=viewerPose.transform.position.y;
          const height=point?cameraY-point.y:0;
          const horizontal=normal&&Math.abs(normal.y)>.91;
          // Reject most table/countertop hits by requiring the surface to be below the camera.
          const plausible=!!point&&horizontal&&height>.55&&height<2.5;
          currentHit=plausible?{position:point}:null;
          if(currentHit){
            ring.position.copy(point);ring.position.y+=.007;ring.visible=true;
            if(!floorConfirmed&&time-lastScanAt>320){
              const compatible=scanSamples.every(p=>Math.abs(p.y-point.y)<.11);
              const distinct=scanSamples.every(p=>Math.hypot(p.x-point.x,p.z-point.z)>.16);
              if(!compatible&&scanSamples.length>=2){scanSamples=[];syncScan();}
              if(distinct&&scanSamples.length<5){scanSamples.push(point.clone());lastScanAt=time;syncScan();}
            }
            btn('confirm').disabled=!floorConfirmed&&scanSamples.length<5;
            if(!floorConfirmed)updateStatus('نمونه معتبر کف: '+scanSamples.length+' از ۵ · گوشی را روی کف حرکت دهید.');
          }else{
            ring.visible=false;btn('confirm').disabled=true;
            if(!floorConfirmed)updateStatus('سطح معتبر پیدا نشد؛ دوربین را پایین‌تر بگیرید.');
          }
        }else{currentHit=null;ring.visible=false;btn('confirm').disabled=true;
          if(!floorConfirmed)updateStatus('سطحی پیدا نشد؛ گوشی را آرام حرکت دهید.');}
        renderer.render(scene,camera);
      });
    }catch(error){
      try{await session.end();}catch{} clean();throw error;
    }
  }
  root.KitchyarAR={start};
})(window);
