/* Independent canvas projection of the same metric scene in 2D and isometric 3D. */
(function (root) {
  'use strict';
  const Core = root.KitchyarCore;
  const GRID = '#d8dcd4';
  const rgba = (hex, alpha) => {
    const h = hex.replace('#', '');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  };
  const pointInPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
    }
    return inside;
  };
  function createScene(canvas, mapCanvas, events) {
    const ctx = canvas.getContext('2d'), mapCtx = mapCanvas.getContext('2d');
    let items = [], mode = '3d', selected = null, active = null, hitRegions = [], grips = [], scale = 60, tool = 'select', draft = null;
    function measure(el) {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
      }
      const c = el.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      return {w, h};
    }
    function project(x, z, y, w, h, s = scale, which = mode) {
      return which === '2d'
        ? [w / 2 + x * s, h / 2 + z * s]
        : [w / 2 + (x - z) * s * .78, h * .54 + (x + z) * s * .35 - y * s * .94];
    }
    function polygon(context, points, fill, stroke, lineWidth = 1) {
      context.beginPath(); context.moveTo(points[0][0], points[0][1]);
      for (const p of points.slice(1)) context.lineTo(p[0], p[1]);
      context.closePath(); context.fillStyle = fill; context.fill();
      if (stroke) {context.strokeStyle = stroke; context.lineWidth = lineWidth; context.stroke();}
    }
    function drawGrid(w, h, which) {
      ctx.save(); ctx.lineWidth = 1;
      const extent = 10;
      for (let a = -extent; a <= extent; a += .5) {
        for (const axis of [0, 1]) {
          const p1 = axis ? project(-extent, a, 0, w, h, scale, which) : project(a, -extent, 0, w, h, scale, which);
          const p2 = axis ? project(extent, a, 0, w, h, scale, which) : project(a, extent, 0, w, h, scale, which);
          ctx.beginPath(); ctx.moveTo(...p1); ctx.lineTo(...p2);
          ctx.strokeStyle = (Math.round(a * 2) % 2 === 0) ? '#d1d8cd' : GRID;
          ctx.globalAlpha = which === '3d' ? .6 : .85; ctx.stroke();
        }
      }
      ctx.restore();
      const origin = project(0, 0, 0, w, h, scale, which);
      ctx.beginPath(); ctx.arc(...origin, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#7e8f76'; ctx.fill();
    }
    function drawVolume(item, w, h, which, selection) {
      const {x, z, width, depth, height, color} = item;
      const x0 = x - width/2, x1 = x + width/2, z0 = z - depth/2, z1 = z + depth/2;
      const pt = (a,b,c) => project(a,b,c,w,h,scale,which);
      if (which === '2d') {
        const poly = [pt(x0,z0,0),pt(x1,z0,0),pt(x1,z1,0),pt(x0,z1,0)];
        polygon(ctx,poly,rgba(color,.75),selection?'#57765a':'#849485',selection?2.5:1);
        if (selection) {
          for (const p of poly) {ctx.fillStyle='#fff';ctx.fillRect(p[0]-4,p[1]-4,8,8);ctx.strokeStyle='#547555';ctx.strokeRect(p[0]-4,p[1]-4,8,8);}
        }
        return [poly];
      }
      const top = [pt(x0,z0,height),pt(x1,z0,height),pt(x1,z1,height),pt(x0,z1,height)];
      const front = [pt(x0,z1,0),pt(x1,z1,0),pt(x1,z1,height),pt(x0,z1,height)];
      const right = [pt(x1,z0,0),pt(x1,z1,0),pt(x1,z1,height),pt(x1,z0,height)];
      polygon(ctx,front,rgba(color,.94),'#8f9f8b');
      polygon(ctx,right,rgba(color,.77),'#889885');
      polygon(ctx,top,rgba(color,.65),selection?'#547555':'#98a99a',selection?2.5:1);
      if (selection) {
        for (const p of [top[0],top[1],top[2],top[3]]) {ctx.beginPath();ctx.arc(...p,4,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#537452';ctx.stroke();}
      }
      return [front,right,top];
    }
    function basis(item) {
      const l = Core.length(item) || 1;
      return {l,dx:(item.x2-item.x1)/l,dz:(item.z2-item.z1)/l,
        nx:-(item.z2-item.z1)/l,nz:(item.x2-item.x1)/l};
    }
    function along(item, t, normal=0) {
      const b=basis(item);return {x:item.x1+b.dx*t+b.nx*normal,z:item.z1+b.dz*t+b.nz*normal};
    }
    function box(item,from,to,depth,elevation,height,w,h,selection,record=true) {
      if(to-from<.002||height<.002)return;
      const a=along(item,from),b=along(item,to),v=basis(item),pt=(p,y)=>project(p.x,p.z,y,w,h);
      const xy=[a,b,{x:b.x+v.nx*depth,z:b.z+v.nz*depth},{x:a.x+v.nx*depth,z:a.z+v.nz*depth}];
      const ground=xy.map(p=>pt(p,elevation)),top=xy.map(p=>pt(p,elevation+height));
      if(mode==='2d') {
        polygon(ctx,ground,rgba(item.color,.8),selection?'#467251':'#819d84',selection?2.5:1);
        if(record)hitRegions.push({id:item.id,faces:[ground]});
        return;
      }
      const f1=[ground[1],ground[2],top[2],top[1]],f2=[ground[2],ground[3],top[3],top[2]],f3=[ground[3],ground[0],top[0],top[3]];
      polygon(ctx,f1,rgba(item.color,.76),'#849883');
      polygon(ctx,f2,rgba(item.color,.92),'#849883');
      polygon(ctx,f3,rgba(item.color,.85),'#849883');
      polygon(ctx,top,rgba(item.color,.64),selection?'#3e7951':'#849883',selection?2.5:1);
      if(record)hitRegions.push({id:item.id,faces:[f1,f2,f3,top]});
    }
    function grip(item, role, p) {
      grips.push({id:item.id,role,p});
      ctx.beginPath();ctx.arc(...p,role==='move'?6:5,0,Math.PI*2);
      ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle=role==='move'?'#e7a55f':'#398364';ctx.lineWidth=2;ctx.stroke();
    }
    function drawWall(item,w,h) {
      const b=basis(item),openings=items.filter(o=>o.kind==='opening'&&o.wallId===item.id).sort((a,c)=>a.offset-c.offset);
      let prev=0;
      for(const op of openings){
        const start=op.offset-op.width/2,end=op.offset+op.width/2;
        box(item,prev,start,item.thickness,0,item.height,w,h,selected===item.id);
        box(item,start,end,item.thickness,0,op.sill,w,h,selected===item.id);
        box(item,start,end,item.thickness,op.sill+op.height,item.height-op.sill-op.height,w,h,selected===item.id);
        prev=end;
      }
      box(item,prev,b.l,item.thickness,0,item.height,w,h,selected===item.id);
      if(selected===item.id) {
        grip(item,'start',project(item.x1,item.z1,mode==='2d'?0:item.height,w,h));
        grip(item,'end',project(item.x2,item.z2,mode==='2d'?0:item.height,w,h));
      }
      const mid=along(item,b.l/2),p=project(mid.x,mid.z,item.height,w,h);
      ctx.fillStyle='#536a55';ctx.textAlign='center';ctx.font='11px Tahoma';ctx.fillText(b.l.toFixed(2)+'m',p[0],p[1]-9);
    }
    function drawRun(item,w,h) {
      const b=basis(item),mid=along(item,b.l/2,item.depth/2);
      box(item,0,b.l,item.depth,item.elevation,item.height,w,h,selected===item.id);
      const p=project(mid.x,mid.z,item.elevation+item.height,w,h);
      ctx.fillStyle='#4a6c59';ctx.textAlign='center';ctx.font='11px Tahoma';ctx.fillText('باکس '+b.l.toFixed(2)+'m',p[0],p[1]-10);
      if(selected===item.id) {
        grip(item,'start',project(item.x1,item.z1,item.elevation+item.height,w,h));
        grip(item,'end',project(item.x2,item.z2,item.elevation+item.height,w,h));
        const d=along(item,b.l/2,item.depth);
        grip(item,'depth',project(d.x,d.z,item.elevation+item.height,w,h));
        if(mode==='3d')grip(item,'height',p);
      }
    }
    function drawOpening(item,w,h) {
      const wall=items.find(i=>i.kind==='wall'&&i.id===item.wallId);if(!wall)return;
      const a=along(wall,item.offset-item.width/2),b=along(wall,item.offset+item.width/2),c=along(wall,item.offset);
      const pt=(p,y)=>project(p.x,p.z,y,w,h),sel=selected===item.id;
      if(mode==='2d') {
        const p1=pt(a,0),p2=pt(b,0);
        ctx.beginPath();ctx.moveTo(...p1);ctx.lineTo(...p2);
        ctx.strokeStyle=item.openingType==='door'?'#a98b6d':'#518e9e';ctx.lineWidth=5;ctx.stroke();
        hitRegions.push({id:item.id,faces:[[p1,[p1[0]+7,p1[1]+7],[p2[0]+7,p2[1]+7],p2]]});
        if(sel){grip(item,'left',p1);grip(item,'right',p2);grip(item,'move',pt(c,0));}
      }else{
        const p=[pt(a,item.sill),pt(b,item.sill),pt(b,item.sill+item.height),pt(a,item.sill+item.height)];
        polygon(ctx,p,rgba(item.color,item.openingType==='window'?.38:.88),sel?'#32748b':'#7297a2',sel?3:2);
        hitRegions.push({id:item.id,faces:[p]});
        if(sel){
          grip(item,'left',pt(a,item.sill+item.height/2));grip(item,'right',pt(b,item.sill+item.height/2));
          grip(item,'top',pt(c,item.sill+item.height));grip(item,'bottom',pt(c,item.sill));
          grip(item,'move',pt(c,item.sill+item.height/2));
        }
      }
    }
    function unproject(p,w,h) {
      if(mode==='2d')return {x:(p.x-w/2)/scale,z:(p.y-h/2)/scale};
      const xx=(p.x-w/2)/scale/.78,zz=(p.y-h*.54)/scale/.35;
      return {x:(xx+zz)/2,z:(zz-xx)/2};
    }
    function snap(p) {
      const candidates=items.filter(i=>i.kind==='wall'||i.kind==='cabinetRun')
        .flatMap(i=>[{x:i.x1,z:i.z1},{x:i.x2,z:i.z2}]);
      return candidates.find(c=>Math.hypot(c.x-p.x,c.z-p.z)<.17)||
        {x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100};
    }
    function deltaAlong(item,p,q,normal=false,w=canvas.clientWidth,h=canvas.clientHeight) {
      const b=basis(item),o=project(0,0,0,w,h);
      const v=project(normal?b.nx:b.dx,normal?b.nz:b.dz,0,w,h);
      const x=v[0]-o[0],y=v[1]-o[1];
      return ((q.x-p.x)*x+(q.y-p.y)*y)/(x*x+y*y||1);
    }
    function offsetOnWall(wall,p,w,h) {
      const a=project(wall.x1,wall.z1,wall.height/2,w,h),b=project(wall.x2,wall.z2,wall.height/2,w,h);
      const dx=b[0]-a[0],dy=b[1]-a[1];
      return Math.max(0,Math.min(Core.length(wall),((p.x-a[0])*dx+(p.y-a[1])*dy)/(dx*dx+dy*dy||1)*Core.length(wall)));
    }
    function drawMap() {
      const {w,h} = measure(mapCanvas); mapCtx.clearRect(0,0,w,h);
      mapCtx.fillStyle = '#edf0e9'; mapCtx.fillRect(0,0,w,h);
      const s = Math.min(w/7,h/5);
      for(let i=-4;i<=4;i++){mapCtx.strokeStyle='#d5dbd0'; mapCtx.lineWidth=1;mapCtx.beginPath();mapCtx.moveTo(w/2+i*s,0);mapCtx.lineTo(w/2+i*s,h);mapCtx.moveTo(0,h/2+i*s);mapCtx.lineTo(w,h/2+i*s);mapCtx.stroke();}
      for(const item of items){
        if(item.kind==='volume'){
          const x=w/2+item.x*s,y=h/2+item.z*s,iw=item.width*s,ih=item.depth*s;
          mapCtx.fillStyle=item.id===selected?'#6f8d69':'#aebcac';
          mapCtx.fillRect(x-iw/2,y-ih/2,iw,ih);mapCtx.strokeStyle='#637b62';mapCtx.strokeRect(x-iw/2,y-ih/2,iw,ih);
        }else if(item.kind==='wall'||item.kind==='cabinetRun'){
          mapCtx.beginPath();mapCtx.moveTo(w/2+item.x1*s,h/2+item.z1*s);
          mapCtx.lineTo(w/2+item.x2*s,h/2+item.z2*s);
          mapCtx.strokeStyle=item.kind==='wall'?'#63806c':item.runType==='wall'?'#87aa83':'#5e9883';
          mapCtx.lineWidth=Math.max(3,(item.thickness||item.depth)*s);mapCtx.stroke();
        }else if(item.kind==='opening'){
          const host=items.find(i=>i.id===item.wallId);if(!host)continue;
          const a=along(host,item.offset-item.width/2),b=along(host,item.offset+item.width/2);
          mapCtx.beginPath();mapCtx.moveTo(w/2+a.x*s,h/2+a.z*s);mapCtx.lineTo(w/2+b.x*s,h/2+b.z*s);
          mapCtx.strokeStyle=item.openingType==='door'?'#b89d75':'#5b97ac';mapCtx.lineWidth=3;mapCtx.stroke();
        }
      }
      mapCtx.fillStyle='#607660';mapCtx.font='10px sans-serif';mapCtx.fillText('PLAN · 1 m',8,h-9);
    }
    function render(nextItems = items, nextMode = mode, nextSelected = selected) {
      items = nextItems; mode = nextMode; selected = nextSelected;
      const {w,h} = measure(canvas); scale = Math.max(28,Math.min(86,Math.min(w/9.2,h/5.6)));
      ctx.clearRect(0,0,w,h);
      const gradient = ctx.createLinearGradient(0,0,0,h);
      gradient.addColorStop(0,mode==='3d'?'#f7f8f4':'#fafbf8');gradient.addColorStop(1,mode==='3d'?'#e8ece4':'#f0f3ed');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      drawGrid(w,h,mode);
      hitRegions=[];grips=[];
      for(const item of [...items].filter(i=>i.kind!=='opening').sort((a,b)=>
        (a.kind==='volume'?a.x+a.z:a.x1+a.z1)-(b.kind==='volume'?b.x+b.z:b.x1+b.z1))){
        if(item.kind==='volume'){
          const faces=drawVolume(item,w,h,mode,item.id===selected);
          hitRegions.push({id:item.id,faces});
          const label=project(item.x,item.z,item.height,w,h);
          ctx.font='12px Tahoma, sans-serif';ctx.textAlign='center';
          ctx.fillStyle='#506650';ctx.fillText(`${item.width.toFixed(2)} × ${item.depth.toFixed(2)} m`,label[0],label[1]-13);
        }
        if(item.kind==='wall')drawWall(item,w,h);
        if(item.kind==='cabinetRun')drawRun(item,w,h);
      }
      for(const item of items.filter(i=>i.kind==='opening'))drawOpening(item,w,h);
      if(draft){
        const d=draft,l=Math.hypot(d.b.x-d.a.x,d.b.z-d.a.z);
        if(l>.01){
          const preview={kind:'cabinetRun',x1:d.a.x,z1:d.a.z,x2:d.b.x,z2:d.b.z,color:'#99bb9c'};
          box(preview,0,l,d.kind==='wall'?.15:d.kind==='base'?.6:.35,
            d.kind==='wall'||d.kind==='base'?0:1.45,d.kind==='wall'?2.8:d.kind==='base'?.85:.72,w,h,true,false);
          const p=project((d.a.x+d.b.x)/2,(d.a.z+d.b.z)/2,0,w,h);
          ctx.textAlign='center';ctx.font='bold 12px Tahoma';ctx.fillStyle='#4b7952';
          ctx.fillText(l.toFixed(2)+' m',p[0],p[1]-8);
        }
      }
      if(!items.length&&!draft){ctx.fillStyle='#879588';ctx.textAlign='center';ctx.font='14px Tahoma, sans-serif';ctx.fillText('از ابزار معماری یا کابینت شروع کنید · کلیک و درگ',w/2,h*.25);}
      drawMap();
    }
    function localPoint(event,el=canvas){const r=el.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
    function pick(pos){
      const handle=[...grips].reverse().find(h=>Math.hypot(h.p[0]-pos.x,h.p[1]-pos.y)<13);
      if(handle)return {id:handle.id,role:handle.role};
      for(const r of [...hitRegions].reverse())if(r.faces.some(face=>pointInPoly(pos.x,pos.y,face)))return {id:r.id,role:'move'};
      return null;
    }
    canvas.addEventListener('pointerdown',(e)=>{
      if(e.button!==0)return;
      const pos=localPoint(e),chosen=pick(pos),w=canvas.clientWidth,h=canvas.clientHeight;
      if(['wall','base','wall-cabinet'].includes(tool)){
        const a=snap(unproject(pos,w,h));
        active={pid:e.pointerId,kind:'draw',start:pos,first:a};
        draft={kind:tool,a,b:a};canvas.setPointerCapture(e.pointerId);render();return;
      }
      if(tool==='window'||tool==='door'){
        const host=items.find(i=>i.id===chosen?.id&&i.kind==='wall')||
          items.filter(i=>i.kind==='wall').find(i=>{
            const a=project(i.x1,i.z1,i.height/2,w,h),b=project(i.x2,i.z2,i.height/2,w,h);
            const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((pos.x-a[0])*dx+(pos.y-a[1])*dy)/(dx*dx+dy*dy||1)));
            return Math.hypot(pos.x-a[0]-dx*t,pos.y-a[1]-dy*t)<23;
          });
        if(host)events.onCreateOpening(host.id,offsetOnWall(host,pos,w,h),tool);
        else events.onHint('ابتدا دیوار را انتخاب کنید تا بازشو روی آن قرار گیرد.');
        return;
      }
      events.onSelect(chosen?.id||null);
      if(chosen){
        const item=items.find(i=>i.id===chosen.id);
        active={pid:e.pointerId,kind:'edit',id:chosen.id,role:chosen.role,start:pos,
          initial:Core.copy(item),before:Core.copy(items),moved:false};
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove',(e)=>{
      if(!active||active.pid!==e.pointerId)return;
      const p=localPoint(e),dx=(p.x-active.start.x)/scale,dy=(p.y-active.start.y)/scale;
      if(active.kind==='draw'){
        const b=snap(unproject(p,canvas.clientWidth,canvas.clientHeight)),a=active.first;
        const l=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(b.z-a.z,b.x-a.x),nearest=Math.round(angle/(Math.PI/2))*(Math.PI/2);
        if(l>.07&&Math.abs(angle-nearest)<.11){b.x=a.x+Math.cos(nearest)*l;b.z=a.z+Math.sin(nearest)*l;}
        draft={kind:draft.kind,a,b};render();return;
      }
      if(Math.hypot(p.x-active.start.x,p.y-active.start.y)<3&&!active.moved)return;
      active.moved=true;
      const item=active.initial,role=active.role;
      if(item.kind==='opening'){
        const host=items.find(i=>i.id===item.wallId);if(!host)return;
        const d=deltaAlong(host,active.start,p),vertical=-(p.y-active.start.y)/(scale*.94),v={};
        if(role==='move')v.offset=item.offset+d;
        if(role==='left'){v.width=item.width-d;v.offset=item.offset+d/2;}
        if(role==='right'){v.width=item.width+d;v.offset=item.offset+d/2;}
        if(role==='top')v.height=item.height+vertical;
        if(role==='bottom'){v.sill=item.sill+vertical;v.height=item.height-vertical;}
        events.onManipulate(active.id,v);return;
      }
      if(item.kind==='wall'||item.kind==='cabinetRun'){
        const b=basis(item),d=deltaAlong(item,active.start,p),v={};
        if(role==='start'){v.x1=item.x1+b.dx*d;v.z1=item.z1+b.dz*d;}
        else if(role==='end'){v.x2=item.x2+b.dx*d;v.z2=item.z2+b.dz*d;}
        else if(role==='depth')v.depth=item.depth+deltaAlong(item,active.start,p,true);
        else if(role==='height')v.height=item.height-(p.y-active.start.y)/(scale*.94);
        else{
          const a=unproject(active.start,canvas.clientWidth,canvas.clientHeight),
            z=unproject(p,canvas.clientWidth,canvas.clientHeight),tx=z.x-a.x,tz=z.z-a.z;
          v.x1=item.x1+tx;v.z1=item.z1+tz;v.x2=item.x2+tx;v.z2=item.z2+tz;
        }
        events.onManipulate(active.id,v);return;
      }
      const mx=mode==='2d'?dx:(dx/.78+dy/.35)/2,mz=mode==='2d'?dy:(dy/.35-dx/.78)/2;
      events.onManipulate(active.id,{x:Math.round((item.x+mx)*100)/100,z:Math.round((item.z+mz)*100)/100});
    });
    function finish(e){
      if(!active||active.pid!==e.pointerId)return;
      const a=active;active=null;
      if(a.kind==='draw'){
        const d=draft;draft=null;render();
        if(Math.hypot(d.b.x-d.a.x,d.b.z-d.a.z)>=.3)events.onCreate(d.kind,d.a,d.b);
        else events.onHint('برای ایجاد حجم، حداقل ۳۰ سانتی‌متر درگ کنید.');
      }else if(a.moved)events.onCommit(a.before);
    }
    canvas.addEventListener('pointerup',finish);
    canvas.addEventListener('pointercancel',e=>{
      if(active&&active.pid===e.pointerId){
        if(active.kind==='edit')events.onCancel(active.before);
        active=null;draft=null;render();
      }
    });
    mapCanvas.addEventListener('click',(e)=>{
      const p=localPoint(e,mapCanvas),r=mapCanvas.getBoundingClientRect(),s=Math.min(r.width/7,r.height/5);
      const found=[...items].reverse().find(i=>{
        if(i.kind==='volume')return Math.abs(p.x-(r.width/2+i.x*s))<=i.width*s/2&&Math.abs(p.y-(r.height/2+i.z*s))<=i.depth*s/2;
        if(i.kind==='wall'||i.kind==='cabinetRun'){
          const a={x:r.width/2+i.x1*s,y:r.height/2+i.z1*s},b={x:r.width/2+i.x2*s,y:r.height/2+i.z2*s};
          const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
          return Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t)<9;
        }
        return false;
      });
      events.onSelect(found?.id||null);
    });
    root.addEventListener('resize',()=>render());
    return {render,setTool(value){tool=value||'select';draft=null;render();},getTool(){return tool;}};
  }
  root.KitchyarScene={createScene};
})(typeof window !== 'undefined'?window:globalThis);
