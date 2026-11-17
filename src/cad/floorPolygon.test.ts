import test from 'node:test';
import assert from 'node:assert/strict';
import { createWall } from './doorRules';
import { deriveFloorPolygon, polygonAreaCm2 } from './floorPolygon';

const hasPoint = (poly: {x:number;y:number}[], x:number,y:number) =>
  poly.some(p => Math.abs(p.x-x)<0.01 && Math.abs(p.y-y)<0.01);

test('two connected perpendicular walls complete to a wall-aligned rectangular tile floor', () => {
  const a=createWall('wall A',0,0,300,0);
  const b=createWall('wall B',0,0,0,240);
  const poly=deriveFloorPolygon([a,b]);
  assert.equal(poly.length,4);
  assert.equal(polygonAreaCm2(poly),72_000);
  for(const [x,y] of [[0,0],[300,0],[0,240],[300,240]]) {
    assert.equal(hasPoint(poly,x,y),true,`missing (${x},${y})`);
  }
});

test('two walls also close when the shared corner is at their far ends', () => {
  const a=createWall('wall A',300,0,0,0);
  const b=createWall('wall B',0,240,0,0);
  const poly=deriveFloorPolygon([a,b]);
  assert.equal(polygonAreaCm2(poly),72_000);
  assert.equal(hasPoint(poly,300,240),true);
});

test('three walls in a U keep all wall edges coincident with floor boundary', () => {
  const poly=deriveFloorPolygon([
    createWall('A',0,0,300,0),
    createWall('B',300,0,300,240),
    createWall('C',300,240,0,240),
  ]);
  assert.equal(poly.length,4);
  assert.equal(polygonAreaCm2(poly),72_000);
  assert.equal(hasPoint(poly,0,0),true);
  assert.equal(hasPoint(poly,0,240),true);
});

test('single wall gets a provisional three-meter deep floor without gaps at endpoints', () => {
  const poly=deriveFloorPolygon([createWall('A',10,20,260,20)]);
  assert.equal(poly.length,4);
  assert.equal(polygonAreaCm2(poly),75_000);
  assert.equal(hasPoint(poly,10,20),true);
  assert.equal(hasPoint(poly,260,20),true);
});
