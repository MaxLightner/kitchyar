const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../apps/preview/smart-layout-proposal.js');
const project=items=>({id:'test',revision:0,scene:{items}});

test('in-app proposal is nonmutating, shows actual sink movement and commits exactly its preview',async()=>{
 const M=await load(),p=project(M.solverExampleItems()),before=JSON.stringify(p);
 const proposal=M.createSmartProposal(p);
 assert.equal(JSON.stringify(p),before);
 assert.equal(proposal.valid,true,JSON.stringify(proposal.issues));
 assert.equal(proposal.moves.length,1);
 assert.ok(proposal.moves[0].distance>.05);
 assert.ok(proposal.summary.min>=.45-1e-6&&proposal.summary.max<=.55+1e-6);
 const applied=M.acceptSmartProposal(p,proposal);
 assert.deepEqual(applied,proposal.result);
 assert.notEqual(applied.items,proposal.result.items);
 assert.equal(JSON.stringify(p),before,'acceptance returns a transaction, without mutating the project');
 assert.match(M.renderSmartProposal(proposal),/طرح فعلی/);
 assert.match(M.renderSmartProposal(proposal),/طرح پیشنهادی/);
});

test('stale proposals are rejected after geometry, style, revision or project changes',async()=>{
 const M=await load(),p=project(M.solverExampleItems()),proposal=M.createSmartProposal(p);
 for(const change of [p=>p.scene.items[0].height+=.1,p=>p.scene.styleId='soft-cream',p=>p.revision++,p=>p.id='other']){
  const changed=structuredClone(p);change(changed);
  assert.throws(()=>M.acceptSmartProposal(changed,proposal),/تغییر کرده/);
 }
});

test('locked sink conflicts cannot be applied or hidden by a confirmation button',async()=>{
 const M=await load(),p=project(M.solverExampleItems()),sink=p.scene.items.find(e=>e.subtype==='sink');
 sink.positionLocked=true;const before=JSON.stringify(p),proposal=M.createSmartProposal(p);
 assert.equal(proposal.valid,false);assert.ok(proposal.issues.length);
 assert.equal(proposal.moves.length,0);assert.equal(JSON.stringify(p),before);
 assert.throws(()=>M.acceptSmartProposal(p,proposal),/قابل اعمال نیست/);
 assert.match(M.renderSmartProposal(proposal),/data-action="confirm-smart-layout" disabled/);
});
