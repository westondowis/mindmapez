/**
 * State rules for the branch details panel. Selecting a branch only ever shows a small corner
 * toggle; the full panel opens when the user asks for it, so a tap never covers the node.
 */
export type DetailState = { branchId: string | null; expanded: boolean };

export const DETAIL_CLOSED: DetailState = { branchId: null, expanded: false };

/** Selecting a branch shows the collapsed toggle (re-selecting the open one keeps its state). */
export function selectDetail(state: DetailState, branchId: string): DetailState {
  return state.branchId === branchId ? state : { branchId, expanded: false };
}

export function toggleDetail(state: DetailState): DetailState {
  return state.branchId ? { ...state, expanded: !state.expanded } : state;
}

export function collapseDetail(state: DetailState): DetailState {
  return state.expanded ? { ...state, expanded: false } : state;
}

/** Two taps on the same node within this window enter the branch (iOS rarely fires dblclick). */
export const DOUBLE_TAP_MS = 350;

export type Tap = { id: string; at: number };

/** True when `id` is tapped again soon enough after `prev`. */
export function isDoubleTap(prev: Tap | null, id: string, now: number, windowMs = DOUBLE_TAP_MS): boolean {
  return !!prev && prev.id === id && now - prev.at >= 0 && now - prev.at <= windowMs;
}

/**
 * Flow-space y to centre the viewport on so the selected node sits in the middle of the visible
 * area above a bottom panel. Centring below the node pushes the node up the screen.
 * @param {number} nodeY Node's flow y.
 * @param {number} zoom Current zoom.
 * @param {number} panelPx Height of the panel covering the bottom of the canvas, in screen px.
 * @returns {number} Flow y to centre on.
 */
export function centerYAbovePanel(nodeY: number, zoom: number, panelPx: number): number {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const p = Number.isFinite(panelPx) && panelPx > 0 ? panelPx : 0;
  return nodeY + p / 2 / z;
}

/** True when a node at screen y (px from the canvas top) would sit under a bottom panel. */
export function hiddenByPanel(nodeScreenY: number, canvasHeightPx: number, panelPx: number, marginPx = 56): boolean {
  return nodeScreenY > canvasHeightPx - panelPx - marginPx;
}
