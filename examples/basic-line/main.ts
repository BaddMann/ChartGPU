/**
 * Basic Line Chart Example
 * Demonstrates: multi-series line rendering with area fill, explicit axis ranges,
 * animation config, event handling (both simple and advanced), and proper cleanup.
 */
import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions, DataPoint } from '../../src/index';
import { createEventManager } from '../../src/interaction/createEventManager';
import type { GridArea } from '../../src/renderers/createGridRenderer';

const createSineWave = (
  count: number,
  opts?: Readonly<{ phase?: number; amplitude?: number }>
): ReadonlyArray<DataPoint> => {
  const n = Math.max(2, Math.floor(count));
  const out: DataPoint[] = new Array(n);
  const phase = opts?.phase ?? 0;
  const amplitude = opts?.amplitude ?? 1;

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = t * Math.PI * 2;
    const y = Math.sin(x + phase) * amplitude;
    out[i] = [x, y] as const;
  }

  return out;
};

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

async function main() {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  const dataA = createSineWave(300, { phase: 0, amplitude: 1 });
  const dataB = createSineWave(300, { phase: Math.PI / 3, amplitude: 1 });
  const dataC = createSineWave(300, { phase: (2 * Math.PI) / 3, amplitude: 1 });
  const xMax = Math.PI * 2;

  const options: ChartGPUOptions = {
    // Grid margins (CSS px): reserve space for axis labels and titles.
    // left=70 for Y-axis labels, bottom=56 for X-axis labels+title, top/right for padding.
    grid: { left: 70, right: 24, top: 24, bottom: 56 },

    // Explicit axis min/max ensures stable, consistent rendering across demos.
    // Axis titles (name) label what each dimension represents.
    xAxis: { type: 'value', min: 0, max: xMax, name: 'Angle (rad)' },
    yAxis: { type: 'value', min: -1.1, max: 1.1, name: 'Amplitude' },

    palette: ['#4a9eff', '#ff4ab0', '#40d17c'],

    // Animation smoothly transitions data updates. Set duration: 0 to disable.
    // Useful when appending live data where animation would be distracting.
    animation: { duration: 900, easing: 'cubicOut', delay: 0 },
    series: [
      {
        type: 'line',
        name: 'sin(x) (filled)',
        data: dataA,
        color: '#4a9eff',
        // Story 2.4 acceptance: `type: "line"` with `areaStyle` should render
        // the area fill behind the line stroke.
        // areaStyle creates a "filled line" by drawing the area under the curve.
        // Low opacity (0.2) keeps the fill subtle and prevents overlapping fills from obscuring each other.
        areaStyle: { opacity: 0.2 },
        lineStyle: { width: 2, opacity: 1 },
      },
      {
        type: 'line',
        name: 'sin(x + π/3)',
        data: dataB,
        lineStyle: { width: 2, opacity: 1 },
      },
      {
        type: 'line',
        name: 'sin(x + 2π/3)',
        data: dataC,
        lineStyle: { width: 2, opacity: 1 },
      },
    ],
  };

  const chart = await ChartGPU.create(container, options);

  // Story 3.11 acceptance: verify ChartGPUInstance.on/off event API
  // Simple event usage: chart.on('event', callback) for high-level interactions.
  // Use this for most cases (hover, click detection).
  chart.on('click', (payload) => console.log('[click]', payload));
  chart.on('mouseover', (payload) => console.log('[mouseover]', payload));
  chart.on('mouseout', (payload) => console.log('[mouseout]', payload));

  // Story 3.1 acceptance-only: verify interaction event manager emits grid-relative coords (CSS px).
  // Advanced: createEventManager gives direct access to grid-relative coordinates (CSS px).
  // Useful for custom tooltips or overlays. Note: multiply by DPR for physical pixels.
  const canvas = container.querySelector('canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Chart canvas not found');
  }

  const makeGridArea = (): GridArea => ({
    left: options.grid?.left ?? 0,
    right: options.grid?.right ?? 0,
    top: options.grid?.top ?? 0,
    bottom: options.grid?.bottom ?? 0,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  });

  const eventManager = createEventManager(canvas, makeGridArea());
  eventManager.on('mousemove', (payload) => {
    console.log(payload.gridX, payload.gridY, payload.isInGrid);
  });

  // Keep the canvas crisp as the container resizes.
  // RAF coalescing pattern: the "scheduled" flag ensures multiple resize events
  // within a single frame batch into one chart.resize() call, preventing redundant work.
  let scheduled = false;
  const ro = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      chart.resize();
      eventManager.updateGridArea(makeGridArea());
    });
  });
  ro.observe(container);

  // Initial sizing/render.
  chart.resize();
  eventManager.updateGridArea(makeGridArea());

  // Cleanup: dispose() releases WebGPU resources (buffers, pipelines, device).
  // Disconnect observers to prevent memory leaks. Critical for long-lived apps.
  window.addEventListener('beforeunload', () => {
    ro.disconnect();
    eventManager.dispose();
    chart.dispose();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main().catch((err) => {
      console.error(err);
      showError(err instanceof Error ? err.message : String(err));
    });
  });
} else {
  main().catch((err) => {
    console.error(err);
    showError(err instanceof Error ? err.message : String(err));
  });
}

