import { createGPUContext, initializeGPUContext, getCanvasTexture } from '../../src/index';
import { createGridRenderer } from '../../src/renderers/createGridRenderer';
import type { GridArea } from '../../src/renderers/createGridRenderer';

/**
 * Grid Renderer Test Example
 *
 * This example demonstrates the grid renderer functionality with:
 * - Configurable horizontal and vertical line counts
 * - Proper coordinate transformation to clip space
 * - Real-time updates via interactive controls
 */

async function main() {
  // Get canvas element
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas element not found');
  }

  // Get control elements
  const horizontalSlider = document.getElementById('horizontal') as HTMLInputElement;
  const verticalSlider = document.getElementById('vertical') as HTMLInputElement;
  const horizontalValue = document.getElementById('horizontal-value') as HTMLSpanElement;
  const verticalValue = document.getElementById('vertical-value') as HTMLSpanElement;

  if (!horizontalSlider || !verticalSlider || !horizontalValue || !verticalValue) {
    throw new Error('Control elements not found');
  }

  let gpuContext: Awaited<ReturnType<typeof initializeGPUContext>> | null = null;
  let animationFrameId: number | null = null;
  let gridRenderer: ReturnType<typeof createGridRenderer> | null = null;

  // Track current line counts
  let currentHorizontal = parseInt(horizontalSlider.value, 10);
  let currentVertical = parseInt(verticalSlider.value, 10);

  try {
    // Create and initialize GPU context
    const ctx = createGPUContext(canvas);
    gpuContext = await initializeGPUContext(ctx);
    const device = gpuContext.device;
    if (!device) {
      throw new Error('WebGPU device not available after GPUContext initialization.');
    }
    const gpuDevice: GPUDevice = device;

    // Create grid renderer (match pipeline format to configured canvas format)
    gridRenderer = createGridRenderer(gpuDevice, { targetFormat: gpuContext.preferredFormat ?? 'bgra8unorm' });

    // Calculate grid area (margins in CSS pixels)
    const gridArea: GridArea = {
      left: 60,
      right: 20,
      top: 40,
      bottom: 40,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };

    // Initial prepare
    gridRenderer.prepare(gridArea, {
      horizontal: currentHorizontal,
      vertical: currentVertical,
    });

    // Update line count displays
    const updateDisplay = () => {
      horizontalValue.textContent = currentHorizontal.toString();
      verticalValue.textContent = currentVertical.toString();
    };

    // Handle slider changes
    horizontalSlider.addEventListener('input', () => {
      currentHorizontal = parseInt(horizontalSlider.value, 10);
      updateDisplay();
      if (gridRenderer) {
        gridRenderer.prepare(gridArea, {
          horizontal: currentHorizontal,
          vertical: currentVertical,
        });
      }
    });

    verticalSlider.addEventListener('input', () => {
      currentVertical = parseInt(verticalSlider.value, 10);
      updateDisplay();
      if (gridRenderer) {
        gridRenderer.prepare(gridArea, {
          horizontal: currentHorizontal,
          vertical: currentVertical,
        });
      }
    });

    // Render loop
    function render() {
      if (!gpuContext || !gridRenderer) return;

      const textureView = getCanvasTexture(gpuContext).createView();
      const commandEncoder = gpuDevice.createCommandEncoder();

      const renderPassDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

      // Render grid
      gridRenderer.render(passEncoder);

      passEncoder.end();

      gpuDevice.queue.submit([commandEncoder.finish()]);

      // Continue rendering
      animationFrameId = requestAnimationFrame(render);
    }

    // Start render loop
    render();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (gridRenderer) {
        gridRenderer.dispose();
      }
      if (gpuContext) {
        gpuContext.device?.destroy();
      }
    });
  } catch (error) {
    console.error('Failed to initialize WebGPU:', error);
    if (error instanceof Error) {
      alert(`WebGPU Error: ${error.message}`);
    } else {
      alert('Failed to initialize WebGPU. Please check browser compatibility.');
    }
    // Clean up on error
    if (gridRenderer) {
      gridRenderer.dispose();
    }
    if (gpuContext) {
      gpuContext.device?.destroy();
    }
  }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
