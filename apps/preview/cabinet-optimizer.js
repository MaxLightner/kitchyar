const EPS=1e-7;

export const DEFAULT_CABINET_OPTIMIZATION=Object.freeze({
  minDoorWidth:.45,
  maxDoorWidth:.55,
  targetDoorWidth:.50,
  fixtureClearance:.02,
  searchStep:.05,
  maxFixtureShift:.35,
  sinkPairMaxWidth:.62
});

const finite=(...values)=>values.every(Number.isFinite);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const roundCm=value=>Math.round(value*100)/100;

export function partitionDoorSpan(span,options={}){
  const rules={...DEFAULT_CABINET_OPTIMIZATION,...options};
  if(!finite(span,rules.minDoorWidth,rules.maxDoorWidth,rules.targetDoorWidth)||
    span<=EPS||rules.minDoorWidth<=0||rules.maxDoorWidth<rules.minDoorWidth)
    return {feasible:false,reason:'invalid-span',span};
  const minCount=Math.ceil((span-EPS)/rules.maxDoorWidth);
  const maxCount=Math.floor((span+EPS)/rules.minDoorWidth);
  if(minCount>maxCount)return {feasible:false,reason:'outside-door-width-range',span,
    minCount,maxCount,minDoorWidth:rules.minDoorWidth,maxDoorWidth:rules.maxDoorWidth};
  let best=null;
  for(let count=minCount;count<=maxCount;count++){
    const width=span/count;
    const score=Math.pow(width-rules.targetDoorWidth,2)+count*1e-7;
    if(!best||score<best.score)best={feasible:true,count,width,
      widths:Array(count).fill(width),score};
  }
  return best;
}

function fixtureZone(fixture,centre,rules){
  const width=Number(fixture.width);
  if(!finite(centre,width)||width<=0)return null;
  let zoneWidth,type=fixture.hasOven?'oven':fixture.subtype;
  if(type==='sink'){
    zoneWidth=Math.max(.90,width+rules.fixtureClearance*2);
  }else if(type==='stove'){
    const columns=Math.max(2,Math.ceil((width+rules.fixtureClearance*2)/rules.maxDoorWidth));
    zoneWidth=columns*rules.targetDoorWidth;
  }else{
    zoneWidth=width+rules.fixtureClearance*2;
  }
  return {a:centre-zoneWidth/2,b:centre+zoneWidth/2,type,fixture,
    centre,zoneWidth};
}

function candidateCentres(fixture,length,rules,allowMoves){
  const zoneWidth=fixtureZone(fixture,fixture.centre,rules)?.zoneWidth??fixture.width+rules.fixtureClearance*2;
  const min=zoneWidth/2,max=length-zoneWidth/2;
  const preferred=Number(fixture.centre);
  if(!finite(preferred)||min>max+EPS)return [];
  if(!allowMoves||fixture.locked)return preferred>=min-EPS&&preferred<=max+EPS?[preferred]:[];
  const values=new Set([roundCm(clamp(preferred,min,max)),roundCm(min),roundCm(max)]);
  const steps=Math.ceil(rules.maxFixtureShift/rules.searchStep);
  for(let step=1;step<=steps;step++){
    for(const sign of [-1,1]){
      const value=preferred+sign*step*rules.searchStep;
      if(value>=min-EPS&&value<=max+EPS)values.add(roundCm(value));
    }
  }
  return [...values].sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred)||a-b);
}

function physicalSpacingValid(fixtures,centres){
  for(let i=0;i<fixtures.length;i++)for(let j=i+1;j<fixtures.length;j++){
    const a=fixtures[i],b=fixtures[j];
    const required=(a.width+b.width)/2+
      (['sink','stove'].includes(a.subtype)&&['sink','stove'].includes(b.subtype) ? .45 : .02);
    if(Math.abs(centres[i]-centres[j])<required-EPS)return false;
  }
  return true;
}

function buildBays(length,zones,preferredUnitWidth,rules){
  const bays=[];
  const leavesPerModule=clamp(Math.round(preferredUnitWidth/rules.targetDoorWidth)||1,1,3);
  const addFree=(start,end)=>{
    const span=end-start;
    if(span<EPS)return true;
    const partition=partitionDoorSpan(span,rules);
    if(!partition.feasible)return false;
    for(let i=0;i<partition.count;i+=leavesPerModule){
      const count=Math.min(leavesPerModule,partition.count-i);
      const a=start+i*partition.width,b=start+(i+count)*partition.width;
      bays.push({a,b,type:'free',leafCount:count});
    }
    return true;
  };
  let cursor=0;
  for(const zone of zones){
    if(zone.a<cursor-EPS||zone.b>length+EPS)return null;
    if(!addFree(cursor,zone.a))return null;
    bays.push({a:zone.a,b:zone.b,type:zone.type,e:zone.fixture});
    cursor=zone.b;
  }
  if(!addFree(cursor,length))return null;
  return bays;
}

function evaluate(length,fixtures,centres,preferredUnitWidth,rules){
  if(!physicalSpacingValid(fixtures,centres))return null;
  const zones=fixtures.map((fixture,index)=>fixtureZone(fixture,centres[index],rules))
    .sort((a,b)=>a.a-b.a);
  let previous=0;
  for(const zone of zones){
    if(zone.a<previous-EPS||zone.a<-EPS||zone.b>length+EPS)return null;
    previous=zone.b;
  }
  const bays=buildBays(length,zones,preferredUnitWidth,rules);
  if(!bays)return null;

  let score=0,totalShift=0;
  for(let i=0;i<fixtures.length;i++){
    const shift=Math.abs(centres[i]-fixtures[i].centre);
    totalShift+=shift;
    const weight=fixtures[i].subtype==='sink'?12:fixtures[i].subtype==='stove'?10:4;
    score+=shift*shift*weight+shift*.02;
  }
  for(const bay of bays){
    if(bay.type!=='free')continue;
    const partition=partitionDoorSpan(bay.b-bay.a,{...rules,
      targetDoorWidth:(bay.leafCount?((bay.b-bay.a)/bay.leafCount):rules.targetDoorWidth)});
    if(!partition.feasible)return null;
    score+=Math.pow((bay.b-bay.a)/Math.max(1,bay.leafCount)-rules.targetDoorWidth,2)*.5;
    score+=Math.pow((bay.b-bay.a)-preferredUnitWidth,2)*.015;
  }
  return {score,totalShift,bays,zones,centres:[...centres]};
}

/**
 * Deterministic cabinet-run solver. Fixture locations are treated as preferred
 * positions unless locked; valid physical spacing is always a hard constraint.
 * Free facade spans are only accepted when they can be tiled with 45–55 cm leaves.
 */
export function solveCabinetRun({
  length,
  fixtures=[],
  preferredUnitWidth=1,
  rules={},
  allowFixtureMoves=true
}={}){
  const config={...DEFAULT_CABINET_OPTIMIZATION,...rules};
  if(!Number.isFinite(length)||length<=EPS)
    return {feasible:false,reason:'invalid-run-length',message:'طول مسیر کابینت معتبر نیست.'};
  if(!finite(config.minDoorWidth,config.maxDoorWidth,config.targetDoorWidth,
    config.fixtureClearance,config.searchStep,config.maxFixtureShift)||
    config.minDoorWidth<=0||config.maxDoorWidth<config.minDoorWidth||
    config.targetDoorWidth<config.minDoorWidth||config.targetDoorWidth>config.maxDoorWidth)
    return {feasible:false,reason:'invalid-rules',message:'قواعد تقسیم درها معتبر نیستند.'};

  const ordered=[...fixtures].filter(f=>f&&Number.isFinite(f.centre)&&Number.isFinite(f.width))
    .sort((a,b)=>a.centre-b.centre||String(a.id).localeCompare(String(b.id)));
  const candidates=ordered.map(f=>candidateCentres(f,length,config,allowFixtureMoves));
  if(candidates.some(list=>!list.length))
    return {feasible:false,reason:'fixture-outside-run',message:'برای یکی از تجهیزات، فضای نصب معتبر در مسیر کابینت وجود ندارد.'};

  let best=null,visited=0;
  const chosen=[];
  const walk=index=>{
    if(index===ordered.length){
      visited++;
      const result=evaluate(length,ordered,chosen,preferredUnitWidth,config);
      if(result&&(!best||result.score<best.score-EPS||
        Math.abs(result.score-best.score)<=EPS&&result.totalShift<best.totalShift-EPS))
        best=result;
      return;
    }
    for(const centre of candidates[index]){
      chosen.push(centre);
      let canContinue=true;
      for(let i=0;i<chosen.length-1;i++){
        const a=ordered[i],b=ordered[index];
        const required=(a.width+b.width)/2+
          (['sink','stove'].includes(a.subtype)&&['sink','stove'].includes(b.subtype) ? .45 : .02);
        if(Math.abs(chosen[i]-centre)<required-EPS){canContinue=false;break;}
      }
      if(canContinue)walk(index+1);
      chosen.pop();
    }
  };
  walk(0);

  if(!best){
    const span=length.toFixed(2);
    return {feasible:false,reason:'no-valid-partition',visited,
      message:`در مسیر ${span} متری، با موقعیت فعلی تجهیزات هیچ تقسیم معتبری با درب‌های ${Math.round(config.minDoorWidth*100)} تا ${Math.round(config.maxDoorWidth*100)} سانتی‌متری پیدا نشد. محل تجهیزات و عرض یونیت‌های مجاور باید در حل مشترک بازبینی شوند.`};
  }
  return {feasible:true,score:best.score,totalShift:best.totalShift,visited,
    bays:best.bays,adjustments:ordered.map((fixture,index)=>({
      id:fixture.id,from:fixture.centre,to:best.centres[index],shift:best.centres[index]-fixture.centre
    })).filter(change=>Math.abs(change.shift)>.001)};
}
