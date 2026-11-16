import { ProjectState, CabinetBox } from './types';
import { getBoxTier, getCornerBlockedZonesForWall } from './cornerLogic';
import { findParentBoxForAppliance, placeApplianceWithCabinetRules } from './doorRules';

const overlap=(a:number,b:number,c:number,d:number)=>a<d-.01&&b>c+.01;

/** Copy a semantic object with fresh IDs; leave the source and other rows intact. */
export function copySelection(project:ProjectState):{next:ProjectState|null;message:string} {
  const next:ProjectState=JSON.parse(JSON.stringify(project));
  const wall=next.walls.find(w=>w.id===next.activeWallId);
  if(!wall)return{next:null,message:'ابتدا یک مورد را انتخاب کنید'};
  const remap=new Map<string,string>();
  const collect=(v:unknown)=>{
    if(Array.isArray(v))v.forEach(collect);
    else if(v&&typeof v==='object') {
      const o=v as Record<string,unknown>;
      if(typeof o.id==='string')remap.set(o.id,'copy_'+crypto.randomUUID());
      Object.values(o).forEach(collect);
    }
  };
  const clone=<T,>(value:T):T=>{
    collect(value);
    return JSON.parse(JSON.stringify(value),(_key,v)=>typeof v==='string'?(remap.get(v)||v):v);
  };
  const clearSelection=()=>{
    next.selectedDoorId=null;next.selectedApplianceId=null;next.selectedOpeningId=null;
    next.selectedShelfId=null;next.selectedHandleId=null;next.selectedFrameId=null;
    next.selectedUnit=null;next.selectedUnitDivider=null;next.multiSelection=undefined;
  };
  const selectedApp=wall.appliances.find(a=>a.id===next.selectedApplianceId);
  if(selectedApp) {
    const widths=selectedApp.width;
    for(const host of wall.boxes.filter(b=>b.type==='base')) {
      for(let x=host.offsetX;x<=host.offsetX+host.width-widths;x++) {
        if(wall.appliances.some(a=>overlap(x,x+widths,a.offsetX,a.offsetX+a.width)))continue;
        const result=placeApplianceWithCabinetRules(wall,next.walls,selectedApp.kind,host,x,next.cornerOwners,selectedApp.hoodKind,
          {sinkModel:selectedApp.sinkModel,customWidth:selectedApp.width});
        if(result.ok&&result.appliance&&!result.replaced) {
          clearSelection();next.activeBoxId=host.id;next.selectedApplianceId=result.appliance.id;
          return{next,message:'تجهیز کپی شد'};
        }
        // A rejected solver candidate must never mutate the deliverable.
        return{next:null,message:result.replaced?'برای کپی این تجهیز یک میزبان مستقل لازم است':result.message};
      }
    }
    return{next:null,message:'برای کپی این تجهیز فضای آزاد سازگار وجود ندارد'};
  }
  const opening=wall.openings?.find(o=>o.id===next.selectedOpeningId);
  if(opening) {
    for(let x=0;x<=wall.length-opening.width;x++) {
      if(wall.openings?.some(o=>overlap(x,x+opening.width,o.offsetX,o.offsetX+o.width)))continue;
      if(wall.boxes.some(b=>overlap(x,x+opening.width,b.offsetX,b.offsetX+b.width)&&overlap(opening.elevY,opening.elevY+opening.height,b.elevY,b.elevY+b.height)))continue;
      const item=clone(opening);item.offsetX=x;wall.openings!.push(item);clearSelection();next.activeBoxId=null;next.selectedOpeningId=item.id;
      return{next,message:'بازشو کپی شد'};
    }
    return{next:null,message:'فضای آزاد برای کپی بازشو وجود ندارد'};
  }
  const root=wall.boxes.find(b=>b.id===next.activeBoxId);
  if(root) {
    const group:CabinetBox[]=[root];
    for(let i=0;i<group.length;i++)for(const child of wall.boxes) {
      if(child.linkedToBoxId===group[i].id&&!group.includes(child))group.push(child);
    }
    const ids=new Set(group.map(b=>b.id));
    const apps=wall.appliances.filter(a=>{const host=findParentBoxForAppliance(wall,a);return host&&ids.has(host.id);});
    const zones=getCornerBlockedZonesForWall(wall,next.walls,next.cornerOwners);
    const min=Math.min(...group.map(b=>b.offsetX)),max=Math.max(...group.map(b=>b.offsetX+b.width));
    const candidates=Array.from({length:Math.max(0,Math.floor(wall.length-(max-min))+1)},(_,i)=>i-min)
      .filter(delta=>Math.abs(delta)>.01).sort((a,b)=>Math.abs(a)-Math.abs(b)||b-a);
    const delta=candidates.find(d=>group.every(b=>{
      const x=b.offsetX+d;
      if(wall.boxes.some(o=>overlap(x,x+b.width,o.offsetX,o.offsetX+o.width)&&overlap(b.elevY,b.elevY+b.height,o.elevY,o.elevY+o.height)))return false;
      if(zones.some(z=>z.tier===getBoxTier(b)&&overlap(x,x+b.width,z.startCm,z.endCm)))return false;
      return !(wall.openings||[]).some(o=>overlap(x,x+b.width,o.offsetX,o.offsetX+o.width)&&overlap(b.elevY,b.elevY+b.height,o.elevY,o.elevY+o.height));
    }));
    if(delta===undefined)return{next:null,message:'فضای آزاد برای کپی باکس و اجزای وابسته وجود ندارد'};
    const copied=clone({boxes:group,appliances:apps});
    for(const b of copied.boxes){b.offsetX+=delta;b.name+=' (کپی)';if(b.linkedToBoxId&&!copied.boxes.some(parent=>parent.id===b.linkedToBoxId))delete b.linkedToBoxId;}
    for(const a of copied.appliances)a.offsetX+=delta;
    wall.boxes.push(...copied.boxes);wall.appliances.push(...copied.appliances);
    clearSelection();next.activeBoxId=copied.boxes[0].id;
    return{next,message:'باکس با درها، دستگیره‌ها و اجزای وابسته کپی شد'};
  }
  const copied=clone(wall);
  copied.name+=' (کپی)';
  const maxX=Math.max(...next.walls.flatMap(w=>[w.x1Cm,w.x2Cm]));
  const clearance=Math.max(150,...next.walls.flatMap(w=>w.boxes.map(b=>b.depth*2+80)));
  const dx=maxX+clearance-Math.min(wall.x1Cm,wall.x2Cm),dy=0;
  copied.x1Cm+=dx;copied.x2Cm+=dx;copied.y1Cm+=dy;copied.y2Cm+=dy;
  next.walls.push(copied);clearSelection();next.activeWallId=copied.id;next.activeBoxId=null;
  return{next,message:'دیوار و اجزای آن کپی شد'};
}
