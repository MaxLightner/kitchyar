import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {CabinetBox, DoorUnit} from './types';
import {
  alignSelectedDoorsInBox,
  equalizeSelectedVerticalWidths,
  equalizeSelectedDrawerHeights,
} from './selectionAlign';

const door = (id:string,startCm:number,widthCm:number,kind:DoorUnit['kind']='door',
  drawerRatios:number[]=[]):DoorUnit=>({
    id,startCm,widthCm,kind,drawerRatios,doorStyle:'flat',
  });
const box = (doors:DoorUnit[],width=240):CabinetBox=>({
  id:'box',name:'Test',type:'base',offsetX:0,elevY:0,width,height:85,depth:60,
  plinth:10,countertopCm:3,doors,unitDividers:[],shelves:[],handles:[],
});

test('Align LEFT moves selection only to first free boundary and never through an unselected door',()=>{
  const b=box([door('fixed',0,50),door('moving',105,40),door('right',190,40)]);
  assert.equal(alignSelectedDoorsInBox(b,['moving'],'left').ok,true);
  assert.equal(b.doors.find(d=>d.id==='moving')?.startCm,50);
  assert.equal(b.doors.find(d=>d.id==='fixed')?.startCm,0);
  assert.equal(b.doors.find(d=>d.id==='right')?.startCm,190);
});

test('Align RIGHT stops at the next unselected door',()=>{
  const b=box([door('left',0,30),door('move',60,30),door('right',165,50)]);
  assert.equal(alignSelectedDoorsInBox(b,['move'],'right').ok,true);
  assert.equal(b.doors.find(d=>d.id==='move')?.startCm,135);
});

test('Center selected items within the CABINET box rather than across the wall',()=>{
  const b=box([door('selected',10,40)]);
  assert.equal(alignSelectedDoorsInBox(b,['selected'],'center').ok,true);
  assert.equal(b.doors[0].startCm,100);
});

test('Selected doors move together without changing other widths and relative spacing',()=>{
  const b=box([door('a',10,35),door('b',55,35),door('fixed',160,45)]);
  assert.equal(alignSelectedDoorsInBox(b,['a','b'],'right').ok,true);
  assert.equal(b.doors.find(d=>d.id==='a')?.startCm,80);
  assert.equal(b.doors.find(d=>d.id==='b')?.startCm,125);
  assert.equal(b.doors.find(d=>d.id==='fixed')?.widthCm,45);
});

test('Vertical equalization modifies widths of SELECTED adjacent doors only',()=>{
  const b=box([door('a',0,40),door('b',40,50),door('untouched',90,55)]);
  assert.equal(equalizeSelectedVerticalWidths(b,['a','b']).ok,true);
  assert.deepEqual(b.doors.map(d=>[d.startCm,d.widthCm]),[[0,45],[45,45],[90,55]]);
});

test('Vertical equalization refuses nonadjacent selection without affecting any other doors',()=>{
  const b=box([door('a',0,40),door('fixed',40,40),door('c',80,40)]);
  assert.equal(equalizeSelectedVerticalWidths(b,['a','c']).ok,false);
  assert.deepEqual(b.doors.map(d=>d.startCm),[0,40,80]);
});

test('Horizontal drawer equalization affects only selected drawer stacks',()=>{
  const b=box([
    door('d1',0,40,'drawer',[.2,.5]),
    door('d2',40,40,'drawer',[.35,.65]),
    door('d3',80,40,'drawer',[.25,.75]),
    door('hinge',120,45,'door',[]),
  ]);
  assert.equal(equalizeSelectedDrawerHeights(b,['d1','d2']).ok,true);
  assert.deepEqual(b.doors[0].drawerRatios,[.3333,.6667]);
  assert.deepEqual(b.doors[1].drawerRatios,[.3333,.6667]);
  assert.deepEqual(b.doors[2].drawerRatios,[.25,.75]);
  assert.equal(b.doors[3].widthCm,45);
});

test('Align UI has exactly five requested buttons; no mirror, seam or compact buttons remain',()=>{
  const source=readFileSync(new URL('../components/TopBar.tsx',import.meta.url),'utf8');
  const ids=[...source.matchAll(/data-testid="(align-[^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,[
    'align-selected-left',
    'align-selected-right',
    'align-selected-center',
    'align-selected-vertical-widths',
    'align-selected-horizontal-heights',
  ]);
});

test('Mouse and pen placement do not require the browser dblclick event',()=>{
  const source=readFileSync(new URL('../components/FrontCanvas.tsx',import.meta.url),'utf8');
  assert.match(source,/e\.pointerType === 'mouse' \|\| e\.pointerType === 'pen'/);
  const scene=readFileSync(new URL('../components/Scene3DCanvas.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(scene,/addEventListener\('dblclick'/);
  const scan=readFileSync(new URL('../components/ARWorkspace.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(scan,/addEventListener\('dblclick'/);
});
