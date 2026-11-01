// Bounded dynamic search over an ordered row. All distances are metres.
// A state includes all preceding equipment, so adjacent moves are considered together.
const EPS=1e-6;
export function splitRegularGap(span){
 if(Math.abs(span)<EPS)return [];
 for(let n=Math.max(1,Math.ceil((span-EPS)/.55));n<=Math.floor((span+EPS)/.45);n++)
  if(span/n>=.45-EPS&&span/n<=.55+EPS)return Array(n).fill(span/n);
 return null;
}
export function solveRow(length,fixtures,{maxShift=.38,beam=96}={}){
 const ordered=[...fixtures].sort((a,b)=>a.centre-b.centre||String(a.id).localeCompare(String(b.id)));
 let states=[{end:0,cost:0,bays:[],placements:[]}];
 for(const fixture of ordered){
  const widths=fixture.type==='sink'?Array.from({length:11},(_,i)=>.9+i*.02):[fixture.width];
  const next=new Map();
  for(const width of widths){
   const positions=[fixture.centre];
   if(!fixture.locked)for(let shift=-Math.round(maxShift*100);shift<=Math.round(maxShift*100);shift++)positions.push(fixture.centre+shift/100);
   for(const centre of [...new Set(positions)]){
    const a=centre-width/2,b=centre+width/2;
    if(a<-EPS||b>length+EPS)continue;
    for(const state of states){
     const gaps=splitRegularGap(a-state.end);if(!gaps)continue;
     const physicalConflict=state.placements.some(p=>{
      if(p.type==='custom'||fixture.type==='custom')return false;
      const clearance=[p.type,fixture.type].includes('sink')&&[p.type,fixture.type].includes('stove')?.45:.02;
      return Math.abs(p.centre-centre)<(p.physicalWidth+fixture.physicalWidth)/2+clearance-EPS;
     });
     if(physicalConflict)continue;
     const cost=state.cost+(centre-fixture.centre)**2+gaps.reduce((s,w)=>s+(w-.5)**2,0)*.1+(width-(fixture.type==='sink'?1:fixture.width))**2*.1;
     const key=Math.round(b*10000),prior=next.get(key);if(prior&&prior.cost<=cost)continue;
     let cursor=state.end;const bays=[...state.bays];
     for(const gap of gaps){bays.push({a:cursor,b:cursor+gap,type:'free'});cursor+=gap;}
     bays.push({a,b,type:fixture.type,equipmentId:fixture.id});
     next.set(key,{end:b,cost,bays,placements:[...state.placements,{...fixture,centre,width}]});
    }
   }
  }
  states=[...next.values()].sort((a,b)=>a.cost-b.cost||a.end-b.end).slice(0,beam);
  if(!states.length)return null;
 }
 let best=null;
 for(const state of states){
  const gaps=splitRegularGap(length-state.end);if(!gaps)continue;
  const cost=state.cost+gaps.reduce((s,w)=>s+(w-.5)**2,0)*.1;
  if(best&&best.cost<=cost)continue;
  let cursor=state.end;const bays=[...state.bays];
  for(const gap of gaps){bays.push({a:cursor,b:cursor+gap,type:'free'});cursor+=gap;}
  best={...state,bays,cost};
 }
 return best;
}
