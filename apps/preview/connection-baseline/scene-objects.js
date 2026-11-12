import {wallBounds} from './kitchen-policy.js?v=editor67';
export const OBJECTS=[['dining4','ناهارخوری ۴ نفره'],['dining6','ناهارخوری ۶ نفره'],['dining8','ناهارخوری ۸ نفره'],['island','جزیره ساده'],['peninsula','اپن صبحانه'],['island-l','جزیره L'],['chair','صندلی'],['stool','صندلی صبحانه'],['ceiling','سقف']];
const clone=v=>structuredClone(v),uid=()=>crypto.randomUUID();
export function placeObject(source,point,type,{ceilingHeight=3.6}={}){
 if(!OBJECTS.some(([t])=>t===type)||![point.x,point.z].every(Number.isFinite))throw Error('محل آبجکت معتبر نیست.');
 const items=clone(source),count=Number(type.replace('dining',''))||0;
 const o={id:uid(),kind:'scene-object',type,name:OBJECTS.find(([t])=>t===type)[1],x:point.x,z:point.z,rotation:0,...(count?{model:'desks2'}:{}),width:count?(count===4?1.2:count===6?1.8:2.4):type==='ceiling'?4:type==='chair'||type==='stool'?.45:2,depth:count?.85:type==='ceiling'?4:type==='chair'||type==='stool'?.45:.9,height:type==='ceiling'?ceilingHeight:type==='chair'?.85:type==='stool'?1.05:count?.76:.90,armLength:1.8,armDepth:.7};
 if(type==='ceiling'){const b=wallBounds(items);if(!b)throw Error('ابتدا حداقل یک دیوار بکش تا محدوده سقف مشخص شود.');Object.assign(o,b);}
 if(type==='ceiling')for(let i=items.length-1;i>=0;i--)if(items[i].type==='ceiling'&&items[i].kind==='scene-object')items.splice(i,1);
 items.push(o);
 const seat=(x,z,rotation,stool=false)=>items.push({id:uid(),kind:'scene-object',type:stool?'stool':'chair',name:stool?'صندلی صبحانه':'صندلی',x:o.x+x,z:o.z+z,rotation,width:.45,depth:.45,height:stool?1.1:.97,model:'chido-chair',groupId:o.id});
 if(count)for(let i=0;i<count/2;i++){const x=(i-(count/2-1)/2)*(o.width/(count/2));seat(x,-.73,0);seat(x,.73,Math.PI);}
 if(['island','island-l','peninsula'].includes(type))for(const x of [-.55,.55])seat(x,.9,Math.PI,true);
 return {items,selectedId:o.id};
}
export function editObject(source,id,values){
 const items=clone(source),o=items.find(o=>o.id===id&&o.kind==='scene-object');if(!o)throw Error('آبجکت پیدا نشد.');
 const old={...o};
 if(o.type==='ceiling'){Object.assign(o,wallBounds(items)||{});values={height:values.height??o.height};}
 if(values.model!==undefined){if(!['simple','desks1','desks2'].includes(values.model))throw Error('مدل میز معتبر نیست.');o.model=values.model;}
 for(const key of ['x','z','width','depth','height','armLength','armDepth','rotation'])if(values[key]!==undefined){const n=Number(values[key]);if(!Number.isFinite(n)||Math.abs(n)>100||(['width','depth','height','armLength','armDepth'].includes(key)&&n<.1))throw Error('ابعاد معتبر نیست.');o[key]=n;}
 // A table carries its chairs when moving/rotating, while each chair remains
 // independently editable. Resizing never resets individually positioned chairs.
 const delta=o.rotation-old.rotation,c=Math.cos(delta),s=Math.sin(delta);
 for(const child of items.filter(p=>p.groupId===o.id)){const x=child.x-old.x,z=child.z-old.z;child.x=o.x+x*c-z*s;child.z=o.z+x*s+z*c;child.rotation+=delta;}
 return {items,selectedId:id};
}
export function footprint(o){const c=Math.cos(o.rotation||0),s=Math.sin(o.rotation||0);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>({x:o.x+x*o.width/2*c-z*o.depth/2*s,z:o.z+x*o.width/2*s+z*o.depth/2*c}));}

export function reseatDining(source,id){
 const items=clone(source),table=items.find(o=>o.id===id&&o.type?.startsWith('dining'));if(!table)throw Error('میز ناهارخوری انتخاب کن.');
 const fresh=placeObject([],{x:table.x,z:table.z},table.type),chairs=fresh.items.filter(o=>o.groupId);
 const c=Math.cos(table.rotation||0),s=Math.sin(table.rotation||0);
 for(const chair of chairs){const x=chair.x-table.x,z=chair.z-table.z;chair.x=table.x+x*c-z*s;chair.z=table.z+x*s+z*c;chair.rotation+=table.rotation||0;chair.groupId=id;}
 return {items:items.filter(o=>o.groupId!==id).concat(chairs),selectedId:id};
}
