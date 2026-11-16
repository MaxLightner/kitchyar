import test from 'node:test';
import assert from 'node:assert/strict';
import { PacedGestureStepper } from './gesturePacing';
import { createProjectRecord } from '../cad/projectStorage';

test('PacedGestureStepper caps two-finger touch cycling with 400ms cooldown and resets on release', () => {
  const stepper = new PacedGestureStepper();

  // Small sub-threshold finger slide does not switch yet
  assert.equal(stepper.consumeTouchDelta(-30, 100), 0);
  // Crossing 55px switches 1 step upward (+1)
  assert.equal(stepper.consumeTouchDelta(-30, 116), 1);

  // Rapid continuous dragging inside 400ms must NEVER switch early or buffer excess steps
  assert.equal(stepper.consumeTouchDelta(-80, 200), 0);
  assert.equal(stepper.consumeTouchDelta(-80, 350), 0);
  assert.equal(stepper.consumeTouchDelta(-80, 500), 0);

  // At t=520 (>= 400ms after t=116), buffered pre-cooldown motion was dropped so a fresh 55px is needed
  assert.equal(stepper.consumeTouchDelta(-30, 520), 0);
  assert.equal(stepper.consumeTouchDelta(-30, 540), 1);

  // Releasing fingers clears partial accumulator so next touch starts fresh
  assert.equal(stepper.consumeTouchDelta(-40, 1100), 0);
  stepper.resetTouch();
  assert.equal(stepper.consumeTouchDelta(-30, 1150), 0);
});

test('PacedGestureStepper suppresses decaying trackpad momentum/inertia after release', () => {
  const stepper = new PacedGestureStepper();

  // Fast two-finger flick -> first step triggers immediately
  assert.equal(stepper.consumeWheelDelta(-95, 0, 1000), 1);

  // OS trackpad decaying momentum frames after user lifts hand
  const momentumDeltas = [-68, -46, -32, -22, -15, -10, -7, -5, -4, -3];
  let extraSteps = 0;
  let t = 1016;
  for (const d of momentumDeltas) {
    t += 55; // Spans > 500ms past first step (up to t=1566)
    const dir = stepper.consumeWheelDelta(d, 0, t);
    if (dir !== 0) extraSteps++;
  }
  assert.equal(extraSteps, 0);

  // After a short idle pause (>160ms) and >=500ms cooldown, a deliberate new scroll works cleanly
  assert.equal(stepper.consumeWheelDelta(-70, 0, 1850), 1);
});

test('createProjectRecord without preset yields a completely blank file (0 walls, 0 boxes)', () => {
  const rec = createProjectRecord('پروژه جدید #2', '2d');
  assert.equal(rec.wallCount, 0);
  assert.equal(rec.boxCount, 0);
  assert.equal(rec.state.walls.length, 0);
});
