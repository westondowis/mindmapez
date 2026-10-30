/**
 * Layout rules for a memory's synapse strand (soma + myelinated axon + terminals).
 * All sizes are in SVG user units. The strand length grows with how much content
 * the memory holds, on a log scale, and is clamped so a tiny note never collides
 * with its parent and a huge document never overflows the sector.
 */

/** Distance between myelin segments along the axon. */
export const SYNAPSE_PITCH = 14;
/** Space taken by the soma and axon hillock before the first segment. */
export const SYNAPSE_LEAD = 48;
/** Space after the last segment for the terminal branches and their bulbs. */
export const SYNAPSE_TAIL = 20;
/** Hard minimum axon length: keeps memory nodes off their parent cluster. */
export const MIN_SYNAPSE_LENGTH = 42;
/** Hard ceiling for the axon length: stops over-extension and sector overflow. */
export const MAX_SYNAPSE_LENGTH = 154;
/** How much axon each decade of content (10x characters) adds. */
const LENGTH_PER_DECADE = 38;

export type SynapseLayout = {
  /** Number of myelin segments (always at least 3). */
  beads: number;
  /** X where the axon ends and the terminal branches begin. */
  axonEnd: number;
  /** Full width of the strand including soma and terminals. */
  width: number;
  /** Axon length (beads * pitch). */
  length: number;
};

/**
 * Axon length for a memory.
 * length = clamp(MIN + (log10(chars) - 1) * k, MIN, MAX)
 * @param {number} [chars] Characters of content (body + transcript + title).
 * @returns {number} Axon length in SVG units, within [MIN, MAX].
 */
export function synapseAxonLength(chars = 0): number {
  const safe = Number.isFinite(chars) ? Math.max(chars, 10) : 10;
  const raw = MIN_SYNAPSE_LENGTH + (Math.log10(safe) - 1) * LENGTH_PER_DECADE;
  return Math.min(MAX_SYNAPSE_LENGTH, Math.max(MIN_SYNAPSE_LENGTH, raw));
}

/**
 * Full strand geometry for a memory, derived from its content length.
 * @param {number} [chars] Characters of content.
 * @returns {SynapseLayout} Segment count and extents; width always covers the terminals.
 */
export function synapseLayout(chars = 0): SynapseLayout {
  const beads = Math.max(3, Math.round(synapseAxonLength(chars) / SYNAPSE_PITCH));
  const axonEnd = SYNAPSE_LEAD + beads * SYNAPSE_PITCH;
  return { beads, axonEnd, width: axonEnd + SYNAPSE_TAIL, length: beads * SYNAPSE_PITCH };
}
