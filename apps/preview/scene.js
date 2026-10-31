/* Independent canvas projection of the same metric scene in 2D and isometric 3D. */
(function (root) {
  'use strict';
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
    let items = [], mode = '3d', selected = null, active = null, hitRegions = [], scale = 60;
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
    function drawMap() {
      const {w,h} = measure(mapCanvas); mapCtx.clearRect(0,0,w,h);
      mapCtx.fillStyle = '#edf0e9'; mapCtx.fillRect(0,0,w,h);
      const s = Math.min(w/7,h/5);
      for(let i=-4;i<=4;i++){mapCtx.strokeStyle='#d5dbd0'; mapCtx.lineWidth=1;mapCtx.beginPath();mapCtx.moveTo(w/2+i*s,0);mapCtx.lineTo(w/2+i*s,h);mapCtx.moveTo(0,h/2+i*s);mapCtx.lineTo(w,h/2+i*s);mapCtx.stroke();}
      for(const item of items){const x=w/2+item.x*s,y=h/2+item.z*s;const iw=item.width*s,ih=item.depth*s;mapCtx.fillStyle=item.id===selected?'#6f8d69':'#aebcac';mapCtx.fillRect(x-iw/2,y-ih/2,iw,ih);mapCtx.strokeStyle='#637b62';mapCtx.strokeRect(x-iw/2,y-ih/2,iw,ih);}
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
      hitRegions=[];
      for(const item of [...items].sort((a,b)=>(a.x+a.z)-(b.x+b.z))){
        const faces=drawVolume(item,w,h,mode,item.id===selected);
        hitRegions.push({id:item.id,faces});
        const label=project(item.x,item.z,item.height,w,h);
        ctx.font='12px Tahoma, sans-serif';ctx.textAlign='center';
        ctx.fillStyle='#506650';ctx.fillText(`${item.width.toFixed(2)} × ${item.depth.toFixed(2)} m`,label[0],label[1]-13);
      }
      if(!items.length){ctx.fillStyle='#879588';ctx.textAlign='center';ctx.font='14px Tahoma, sans-serif';ctx.fillText('صحنه خالی است · برای تست تعامل یک حجم نمونه اضافه کنید',w/2,h*.25);}
      drawMap();
    }
    function localPoint(event,el=canvas){const r=el.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
    function pick(pos){for(const r of [...hitRegions].reverse())if(r.faces.some(face=>pointInPoly(pos.x,pos.y,face)))return r.id;return null;}
    canvas.addEventListener('pointerdown',(e)=>{
      if(e.button!==0)return;
      const pos=localPoint(e), chosen=pick(pos);events.onSelect(chosen);
      if(chosen){const item=items.find(i=>i.id===chosen);active={pid:e.pointerId,id:chosen,start:pos,initial:{x:item.x,z:item.z},before:JSON.parse(JSON.stringify(items)),moved:false};canvas.setPointerCapture(e.pointerId);}
    });
    canvas.addEventListener('pointermove',(e)=>{
      if(!active||active.pid!==e.pointerId)return;
      const p=localPoint(e), dx=(p.x-active.start.x)/scale, dy=(p.y-active.start.y)/scale;
      if(Math.hypot(p.x-active.start.x,p.y-active.start.y)<3&&!active.moved)return;
      active.moved=true;
      const mx=mode==='2d'?dx:(dx/.78+dy/.35)/2;
      const mz=mode==='2d'?dy:(dy/.35-dx/.78)/2;
      events.onMove(active.id,Math.round((active.initial.x+mx)*100)/100,Math.round((active.initial.z+mz)*100)/100);
    });
    function finish(e){if(active&&active.pid===e.pointerId){const a=active;active=null;if(a.moved)events.onCommit(a.before);}}
    canvas.addEventListener('pointerup',finish);
    canvas.addEventListener('pointercancel',finish);
    mapCanvas.addEventListener('click',(e)=>{
      const p=localPoint(e,mapCanvas),r=mapCanvas.getBoundingClientRect(),s=Math.min(r.width/7,r.height/5);
      const found=[...items].reverse().find(i=>Math.abs(p.x-(r.width/2+i.x*s))<=i.width*s/2&&Math.abs(p.y-(r.height/2+i.z*s))<=i.depth*s/2);
      events.onSelect(found?.id||null);
    });
    root.addEventListener('resize',()=>render());
    return {render};
  }
  root.KitchyarScene={createScene};
})(typeof window !== 'undefined'?window:globalThis);
