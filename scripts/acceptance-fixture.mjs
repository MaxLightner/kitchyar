export async function build(shape){
 const G=await import('../apps/preview/geometry.js');
 let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeWall(r.items,{x:5,z:0},{x:5,z:6});if(shape==='U')r=G.placeWall(r.items,{x:5,z:6},{x:0,z:6});
 const walls=r.items.filter(w=>w.kind==='wall'),a={x:.2,z:0,hostId:walls[0].id,side:1},b=shape==='L'?{x:5,z:5.8,hostId:walls[1].id}:{x:.2,z:6,hostId:walls[2].id};
 r=G.placeCabinetRoute(r.items,a,b,{kind:'base',depth:.6});r=G.placeCabinetRoute(r.items,a,b,{kind:'upper',depth:.35,height:.9,elevation:1.55});
 r=G.placeEquipment(r.items,{x:1.5,z:.3},'sink');r=G.placeEquipment(r.items,{x:3.4,z:.3},'stove');
 r=G.placeEquipment(r.items,{x:4.7,z:1.5},'washer');
 r=G.placeTallCabinet(r.items,shape==='L'?{x:4.7,z:3}:{x:2.5,z:5.7});
 r=G.placeEquipment(r.items,{x:4.7,z:4.6},'fridge');
 return {G,items:r.items};
}
