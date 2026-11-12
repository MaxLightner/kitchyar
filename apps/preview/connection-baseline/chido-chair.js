// Adapted from MaxLightner/tolica-ar decor.js, createDecor(11).
// Chido uses an origin at half-height; Kitchyar uses the floor as origin.
export function createChidoChair(THREE,{width=.45,depth=.45,height=.95,stool=false}={}){
 const root=new THREE.Group(),seat=stool?.74:.48;
 const fabric=new THREE.MeshStandardMaterial({color:0xc6baa7,roughness:.88}),legs=new THREE.MeshStandardMaterial({color:0x675a4e,roughness:.8});
 const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);};
 add(new THREE.BoxGeometry(width,.085,depth),fabric,0,seat,0);
 add(new THREE.BoxGeometry(width,stool?.32:.49,.065),fabric,0,seat+(stool?.16:.23),-depth/2+.027);
 for(const x of [-1,1])for(const z of [-1,1])add(new THREE.CylinderGeometry(.020,.023,seat-.03,6),legs,x*(width/2-.08),(seat-.03)/2,z*(depth/2-.08));
 if(stool)add(new THREE.BoxGeometry(width-.12,.022,.022),legs,0,.28,depth/2-.08);
 root.scale.y=height/(stool?1.06:.955);root.name='chido-minimal-dining-chair';return root;
}
