import { createAnimationController } from '../../src/core/createAnimationController';
import { easeCubicOut, easeLinear } from '../../src/utils/easing';

// TypeScript-only acceptance checks for Story 5.15 Animation Controller.
// This file is excluded from the library build (tsconfig excludes `examples/`).

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertInClosedRange = (
  label: string,
  actual: number,
  minInclusive: number,
  maxInclusive: number,
): void => {
  assert(
    Number.isFinite(actual),
    `${label}: expected finite number but got ${actual}`,
  );
  assert(
    actual >= minInclusive && actual <= maxInclusive,
    `${label}: expected in [${minInclusive}, ${maxInclusive}] but got ${actual}`,
  );
};

// Scalar tween: 0 -> 100 over 300ms, monotonic easing, discrete updates at 0/150/300.
// - first update yields ~0
// - mid update yields between (0, 100)
// - final yields exactly 100
// - onComplete fires exactly once (and never again on subsequent updates)
{
  const c = createAnimationController();

  const updates: number[] = [];
  let completeCalls = 0;

  c.animate(
    0,
    100,
    300,
    easeCubicOut,
    (v) => {
      updates.push(v);
    },
    () => {
      completeCalls += 1;
    },
  );

  c.update(0);
  c.update(150);
  c.update(300);

  assert(
    updates.length === 3,
    `scalar tween: expected 3 onUpdate calls, got ${updates.length}`,
  );
  assert(
    updates[0] === 0,
    `scalar tween @0ms: expected exactly 0, got ${updates[0]}`,
  );
  assertInClosedRange('scalar tween @150ms', updates[1]!, 0, 100);
  assert(
    updates[1]! > 0 && updates[1]! < 100,
    `scalar tween @150ms: expected strictly between (0, 100), got ${updates[1]}`,
  );
  assert(
    updates[2] === 100,
    `scalar tween @300ms: expected exactly 100, got ${updates[2]}`,
  );
  assert(
    completeCalls === 1,
    `scalar tween: expected onComplete exactly once, got ${completeCalls}`,
  );

  // After completion, further updates should not emit update/complete.
  c.update(450);
  assert(
    updates.length === 3,
    `scalar tween post-complete: expected no additional onUpdate calls, got ${updates.length}`,
  );
  assert(
    completeCalls === 1,
    `scalar tween post-complete: expected onComplete to remain 1, got ${completeCalls}`,
  );
}

// Cancel behavior:
// - Start an animation, update once, then cancel(id)
// - Subsequent updates should not invoke onUpdate
// - onComplete must not fire
{
  const c = createAnimationController();

  const updates: number[] = [];
  let completeCalls = 0;

  const id = c.animate(
    0,
    100,
    300,
    easeLinear,
    (v) => {
      updates.push(v);
    },
    () => {
      completeCalls += 1;
    },
  );

  c.update(0);
  assert(
    updates.length === 1,
    `cancel: expected 1 onUpdate call before cancel, got ${updates.length}`,
  );
  assert(
    updates[0] === 0,
    `cancel @0ms: expected exactly 0 before cancel, got ${updates[0]}`,
  );

  c.cancel(id);

  c.update(150);
  c.update(300);
  c.update(450);

  assert(
    updates.length === 1,
    `cancel: expected no additional onUpdate calls after cancel, got ${updates.length}`,
  );
  assert(
    completeCalls === 0,
    `cancel: expected onComplete to not fire, got ${completeCalls}`,
  );
}

// Array tween (nice-to-have): [0,0] -> [100,50] over 300ms; endpoints and length correct.
{
  const c = createAnimationController();

  const snapshots: number[][] = [];
  let completeCalls = 0;

  c.animate(
    [0, 0],
    [100, 50],
    300,
    easeLinear,
    (v) => {
      snapshots.push([...v]);
    },
    () => {
      completeCalls += 1;
    },
  );

  c.update(0);
  c.update(300);

  assert(
    snapshots.length === 2,
    `array tween: expected 2 onUpdate calls, got ${snapshots.length}`,
  );
  assert(
    snapshots[0]!.length === 2 && snapshots[1]!.length === 2,
    `array tween: expected output length 2, got ${snapshots[0]!.length} and ${snapshots[1]!.length}`,
  );
  assert(
    snapshots[0]![0] === 0 && snapshots[0]![1] === 0,
    `array tween @0ms: expected [0,0], got [${snapshots[0]!.join(',')}]`,
  );
  assert(
    snapshots[1]![0] === 100 && snapshots[1]![1] === 50,
    `array tween @300ms: expected [100,50], got [${snapshots[1]!.join(',')}]`,
  );
  assert(
    completeCalls === 1,
    `array tween: expected onComplete exactly once, got ${completeCalls}`,
  );
}

