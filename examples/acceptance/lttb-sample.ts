import { performance } from 'node:perf_hooks';
import { lttbSample } from '../../src/data/lttbSample';

// TypeScript-only acceptance + micro-benchmark checks for Story 5.7.
// This file is excluded from the library build (tsconfig excludes `examples/`).
//
// Intent: validate that 100K -> 1K LTTB downsampling preserves peaks/valleys.

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

// Small deterministic PRNG (Mulberry32).
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSyntheticInterleavedXY(n: number, seed = 1337): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(n * 2);

  for (let i = 0; i < n; i++) {
    // x must be strictly increasing for many charting paths.
    const x = i;

    // Multi-frequency baseline + small noise so "shape" is non-trivial.
    const t = i;
    const baseline =
      Math.sin(t * 0.01) +
      0.6 * Math.sin(t * 0.0017) +
      0.25 * Math.sin(t * 0.00023);

    const noise = (rand() - 0.5) * 0.15;

    // Deterministic spikes / dips to create clear peaks/valleys.
    // These should be "important" enough that a good downsampler retains them.
    let y = baseline + noise;
    if (i % 1973 === 0) y += 8;
    if (i % 2467 === 0) y -= 8;
    if (i % 7919 === 0) y += 12;
    if (i % 10427 === 0) y -= 12;

    out[i * 2 + 0] = x;
    out[i * 2 + 1] = y;
  }

  return out;
}

function topKIndicesByYInterleaved(
  data: Float32Array,
  k: number,
  mode: 'max' | 'min',
): Int32Array {
  const n = data.length >>> 1;
  if (k <= 0 || n === 0) return new Int32Array(0);
  const kk = Math.min(k, n);

  // Maintain a sorted list of (index, y). kk is small (defaults to 50), so O(n*kk) is fine.
  const indices: number[] = [];
  const ys: number[] = [];

  const better = (candidateY: number, worstY: number): boolean => {
    return mode === 'max' ? candidateY > worstY : candidateY < worstY;
  };

  const insertSorted = (idx: number, y: number): void => {
    if (indices.length === 0) {
      indices.push(idx);
      ys.push(y);
      return;
    }

    // Find insertion point in sorted order.
    // - mode 'max': ys is descending
    // - mode 'min': ys is ascending
    let pos = 0;
    if (mode === 'max') {
      while (pos < ys.length && y <= ys[pos]!) pos++;
    } else {
      while (pos < ys.length && y >= ys[pos]!) pos++;
    }

    indices.splice(pos, 0, idx);
    ys.splice(pos, 0, y);

    if (indices.length > kk) {
      indices.pop();
      ys.pop();
    }
  };

  for (let i = 0; i < n; i++) {
    const y = data[i * 2 + 1]!;
    if (!Number.isFinite(y)) continue;

    if (indices.length < kk) {
      insertSorted(i, y);
      continue;
    }

    const worstY = ys[ys.length - 1]!;
    if (better(y, worstY)) insertSorted(i, y);
  }

  return Int32Array.from(indices);
}

function countExtremaRetainedWithinWindow(
  extremaIndices: Int32Array,
  sampledIndices: Int32Array,
  windowHalfWidth: number,
): number {
  let retained = 0;
  for (let e = 0; e < extremaIndices.length; e++) {
    const idx = extremaIndices[e]!;

    // "Within window" definition:
    // - exact retention passes
    // - otherwise, allow the sampled point to land within +/- windowHalfWidth indices
    //   around the extremum (a "bucket-sized window" tolerance).
    let ok = false;
    for (let s = 0; s < sampledIndices.length; s++) {
      const j = sampledIndices[s]!;
      const d = j - idx;
      if (d === 0 || (d <= windowHalfWidth && d >= -windowHalfWidth)) {
        ok = true;
        break;
      }
    }
    if (ok) retained++;
  }
  return retained;
}

{
  const N = 100_000;
  const TARGET = 1_000;
  const K = 50;

  const input = generateSyntheticInterleavedXY(N, 1337);

  const t0 = performance.now();
  const sampled = lttbSample(input, TARGET);
  const t1 = performance.now();

  assert(sampled instanceof Float32Array, 'Expected Float32Array output for typed-array input.');

  const sampledPoints = sampled.length >>> 1;
  assert(
    sampledPoints === TARGET,
    `Expected ${TARGET} output points, got ${sampledPoints} (Float32Array length ${sampled.length}).`,
  );

  // Endpoints must match exactly per LTTB contract in implementation (first + last fixed).
  assert(sampled[0] === input[0], 'First x should match input[0].');
  assert(sampled[1] === input[1], 'First y should match input[1].');
  assert(sampled[sampled.length - 2] === input[input.length - 2], 'Last x should match input last x.');
  assert(sampled[sampled.length - 1] === input[input.length - 1], 'Last y should match input last y.');

  // X must be non-decreasing.
  for (let i = 1; i < sampledPoints; i++) {
    const prevX = sampled[(i - 1) * 2 + 0]!;
    const x = sampled[i * 2 + 0]!;
    if (!(x >= prevX)) {
      throw new Error(`Expected non-decreasing x; found sampled x[${i - 1}]=${prevX} > x[${i}]=${x}`);
    }
  }

  // Peak/valley preservation heuristic.
  //
  // We compute the top-K global maxima and minima indices by y in the original data.
  // An extremum is considered "retained" if:
  // - it exists exactly in the sampled set (same x/index), OR
  // - there exists a sampled point within a "bucket-sized window" around it.
  //
  // Window choice rationale:
  // LTTB selects ~1 point per bucket where nominal bucket size is (N-2)/(TARGET-2).
  // Allowing +/- half-bucket provides tolerance for picking a neighbor near a sharp spike,
  // while still failing if peaks/valleys drift too far.
  const bucketSize = (N - 2) / (TARGET - 2);
  const windowHalfWidth = Math.max(1, Math.floor(bucketSize / 2));

  const sampledIndices = new Int32Array(sampledPoints);
  for (let i = 0; i < sampledPoints; i++) {
    // We generated x as integer indices, so sampled x should be an exact integer in float32.
    sampledIndices[i] = Math.round(sampled[i * 2 + 0]!);
  }

  const maxIdx = topKIndicesByYInterleaved(input, K, 'max');
  const minIdx = topKIndicesByYInterleaved(input, K, 'min');

  const maxRetained = countExtremaRetainedWithinWindow(maxIdx, sampledIndices, windowHalfWidth);
  const minRetained = countExtremaRetainedWithinWindow(minIdx, sampledIndices, windowHalfWidth);

  const maxRetention = maxRetained / maxIdx.length;
  const minRetention = minRetained / minIdx.length;

  // Reasonable default thresholds:
  // - For large, spike-heavy signals, a good LTTB implementation should retain most strong extrema.
  // - We require 70% for both maxima and minima to catch obvious regressions without being flaky.
  const THRESHOLD = 0.7;
  assert(
    maxRetention >= THRESHOLD,
    `Maxima retention too low: ${(maxRetention * 100).toFixed(1)}% (${maxRetained}/${maxIdx.length}), threshold ${(THRESHOLD * 100).toFixed(0)}%`,
  );
  assert(
    minRetention >= THRESHOLD,
    `Minima retention too low: ${(minRetention * 100).toFixed(1)}% (${minRetained}/${minIdx.length}), threshold ${(THRESHOLD * 100).toFixed(0)}%`,
  );

  const ms = t1 - t0;
  console.log('[acceptance:lttb-sample] OK');
  console.log(
    `[acceptance:lttb-sample] N=${N} -> TARGET=${TARGET} (bucketSize≈${bucketSize.toFixed(
      2,
    )}, windowHalfWidth=${windowHalfWidth}, K=${K})`,
  );
  console.log(
    `[acceptance:lttb-sample] maxima retention ${(maxRetention * 100).toFixed(1)}% (${maxRetained}/${
      maxIdx.length
    }), minima retention ${(minRetention * 100).toFixed(1)}% (${minRetained}/${minIdx.length})`,
  );
  console.log(`[acceptance:lttb-sample] downsample time ${ms.toFixed(2)}ms`);
}

