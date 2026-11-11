/** Explicit layers on the React Flow node wrappers, not just their child buttons. */
export function graphNodeLayer(type: string | undefined, expanded = false): number {
  return type === "memory" ? (expanded ? 100 : 20) : 1;
}

type GraphNode = {
  id: string; type?: string; position: { x: number; y: number };
  data: Record<string, unknown>;
};
/** Selection is presentation only. Keep local branch coordinates and reanchor memories by id. */
export function reconcileGraphNodes<N extends GraphNode>(built: N[], local: GraphNode[], sameView: boolean): N[] {
  const previous = new Map(local.map(n => [n.id, n]));
  const source = new Map(built.map(n => [n.id, n]));
  return built.map(node => {
    let position = sameView ? (previous.get(node.id)?.position ?? node.position) : node.position;
    if (sameView && node.type === "memory" && typeof node.data.anchorId === "string") {
      const base = source.get(node.data.anchorId);
      const anchor = previous.get(node.data.anchorId) ?? base;
      if (base && anchor) position = {
        x: anchor.position.x + node.position.x - base.position.x,
        y: anchor.position.y + node.position.y - base.position.y,
      };
      else position = node.position;
    }
    return { ...node, position, zIndex: graphNodeLayer(node.type, node.data.expanded === true) };
  });
}
