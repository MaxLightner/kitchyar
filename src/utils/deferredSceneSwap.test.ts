import test from 'node:test';
import assert from 'node:assert/strict';
import { drainDeferredSceneJobs } from './deferredSceneSwap';

test('waits for all deferred equipment jobs before committing the new room', () => {
  const events: string[] = [];
  const scheduled: Array<() => void> = [];
  const delays: number[] = [];
  drainDeferredSceneJobs(
    [() => { events.push('sink'); }, () => { events.push('fridge'); }, () => { events.push('stove'); }],
    (task, ms) => { scheduled.push(task); delays.push(ms); },
    () => true,
    () => { events.push('swap'); },
    err => { throw err; },
  );
  assert.deepEqual(events, [], 'Old scene remains untouched while equipment is loading');
  while (scheduled.length) scheduled.shift()?.();
  assert.deepEqual(events, ['sink', 'fridge', 'stove', 'swap']);
  assert.deepEqual(delays, [0, 40, 40]);
});

test('cancels superseded rebuild without mounting any incomplete scene', () => {
  let active = true;
  const events: string[] = [];
  const scheduled: Array<() => void> = [];
  drainDeferredSceneJobs(
    [() => { events.push('first model'); }, () => { events.push('second model'); }],
    task => { scheduled.push(task); },
    () => active,
    () => { events.push('swap'); },
    err => { throw err; },
  );
  scheduled.shift()?.();
  active = false;
  scheduled.shift()?.();
  assert.deepEqual(events, ['first model']);
});

test('a failed equipment build does not leave the whole room hidden', () => {
  const errors: unknown[] = [];
  const events: string[] = [];
  const scheduled: Array<() => void> = [];
  drainDeferredSceneJobs(
    [() => { throw new Error('bad equipment'); }, () => { events.push('valid equipment'); }],
    task => { scheduled.push(task); },
    () => true,
    () => { events.push('swap'); },
    error => { errors.push(error); },
  );
  while (scheduled.length) scheduled.shift()?.();
  assert.equal(errors.length, 1);
  assert.deepEqual(events, ['valid equipment', 'swap']);
});
