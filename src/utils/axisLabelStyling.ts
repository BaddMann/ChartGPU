/**
 * Shared axis label styling utilities.
 * Ensures consistent styling between main thread (DOM overlay) and worker thread rendering.
 */

import type { AxisLabel } from '../config/types.js';
import type { TextOverlay } from '../components/createTextOverlay.js';

/**
 * Theme configuration for axis labels.
 */
export interface AxisLabelThemeConfig {
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textColor: string;
}

/**
 * Calculates the font size for axis titles (larger than regular tick labels).
 */
export function getAxisTitleFontSize(baseFontSize: number): number {
  return Math.max(
    baseFontSize + 1,
    Math.round(baseFontSize * 1.15)
  );
}

/**
 * Applies consistent styling to an axis label span element.
 */
export function styleAxisLabelSpan(
  span: HTMLSpanElement,
  label: AxisLabel,
  theme: AxisLabelThemeConfig
): void {
  // Set inline styles
  span.dir = 'auto';
  span.style.fontFamily = theme.fontFamily;

  // Axis titles are bold
  if (label.isTitle) {
    span.style.fontWeight = '600';
  }
}

/**
 * Adds axis labels to a text overlay with consistent styling.
 */
export function addAxisLabelsToOverlay(
  overlay: TextOverlay,
  xLabels: readonly AxisLabel[],
  yLabels: readonly AxisLabel[],
  theme: AxisLabelThemeConfig
): void {
  // Clear existing labels
  overlay.clear();

  const axisNameFontSize = getAxisTitleFontSize(theme.fontSize);

  // Add X-axis labels
  for (const label of xLabels) {
    const span = overlay.addLabel(label.text, label.x, label.y, {
      fontSize: label.isTitle ? axisNameFontSize : theme.fontSize,
      color: theme.textColor,
      anchor: label.anchor ?? 'middle',
      rotation: label.rotation,
    });
    styleAxisLabelSpan(span, label, theme);
  }

  // Add Y-axis labels
  for (const label of yLabels) {
    const span = overlay.addLabel(label.text, label.x, label.y, {
      fontSize: label.isTitle ? axisNameFontSize : theme.fontSize,
      color: theme.textColor,
      anchor: label.anchor ?? 'end',
      rotation: label.rotation,
    });
    styleAxisLabelSpan(span, label, theme);
  }
}
