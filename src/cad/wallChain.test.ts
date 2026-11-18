import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArScannedWall, snapArWallEndpointsCm } from '../ar/arCalibration';
import { createWall } from './doorRules';
import { snapWallEndpoint } from './wallSnap';
import type { Wall } from './types';

test('AR chain continues at the committed endpoint and closes without a gap', () => {
  const walls: Wall[] = [];
  let start = { x: 0, z: 0 };
  for (const target of [{ x: 3.12, z: .28 }, { x: 3.2, z: 3 }, { x: .03, z: 3 }, { x: .03, z: .03 }]) {
    const wall = buildArScannedWall(walls, start, target, 265);
    const previous = walls.at(-1);
    if (previous) {
      assert.equal(wall.x1Cm, previous.x2Cm);
      assert.equal(wall.y1Cm, previous.y2Cm);
    }
    walls.push(wall);
    start = { x: wall.x2Cm / 100, z: wall.y2Cm / 100 };
  }
  const last = walls.at(-1);
  assert.ok(last);
  assert.equal(last.x2Cm, walls[0].x1Cm);
  assert.equal(last.y2Cm, walls[0].y1Cm);
});

test('endpoint welding wins over angle assistance and picks the nearest endpoint', () => {
  const wall = createWall('target', 300, 35, 600, 35);
  const result = snapArWallEndpointsCm({ x: 0, z: 0 }, { x: 3, z: .35 }, [wall]);
  assert.equal(result.x2Cm, 300);
  assert.equal(result.y2Cm, 35);
  const other = createWall('near', 310, 35, 700, 35);
  assert.deepEqual(snapWallEndpoint({ x: 309, y: 34 }, [wall, other]), { x: 310, y: 35, corner: true });
  assert.equal(snapWallEndpoint({ x: 1000, y: 1000 }, [wall]).corner, false);
});
