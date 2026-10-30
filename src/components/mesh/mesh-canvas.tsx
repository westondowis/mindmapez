import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { BrainOverview } from "@/components/brain/brain-overview";
import { BranchComposer } from "@/components/brain/branch-composer";
import { BranchSheet } from "@/components/brain/branch-sheet";
import { NavTrail } from "@/components/brain/nav-trail";
import { RecordDock } from "@/components/brain/record-dock";
import { SectorEditor } from "@/components/brain/sector-editor";
import { SectorGuide } from "@/components/brain/sector-guide";
import { sectorTitle } from "@/lib/brain";
import { Button } from "@/components/ui/button";
import { markAccountDirty, registerAccountFlusher } from "@/lib/account-persist";
import {
  breadcrumbPath,
  childrenOf,
  defaultSectors,
  loadBrainNav,
  saveBrainNav,
  sectorById,
  type BrainSector,
  type BrainSectorId,
  type Crumb,
} from "@/lib/brain";
import { KIND_COLOR } from "@/lib/kind-styles";
import {
  createBranch,
  deleteBranch,
  duplicateBranch,
  moveBranch,
  saveBrainSectors,
  updateBranch,
} from "@/lib/server/branches";
import { createMemory, savePositions } from "@/lib/server/memories";
import type { Concept, GraphPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { synapseLayout } from "@/lib/synapse";
import { nodeTypes } from "./nodes";

const ME_ID = "me";
const SECTOR_HUB = "__sector__";
const DRAFT_ID = "__draft__";

function ring(index: number, total: number, radius: number, origin = { x: 0, y: 0 }) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return { x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius };
}

function rowBelow(index: number, total: number, origin = { x: 0, y: 0 }, gap = 200, drop = 230) {
  const span = Math.max(total, 1) - 1;
  return { x: origin.x - (span * gap) / 2 + index * gap, y: origin.y + drop };
}

function layoutTree(concepts: Concept[], sectorId: string, focusId?: string | null) {
  const positions = new Map<string, { x: number; y: number }>();
  if (focusId && focusId !== sectorId) {
    const parent = concepts.find((c) => c.id === focusId);
    const origin = { x: parent?.positionX ?? 0, y: parent?.positionY ?? 0 };
    const kids = childrenOf(concepts, focusId);
    kids.forEach((k, i) => positions.set(k.id, rowBelow(i, kids.length, origin, 220, 280)));
    return positions;
  }
  const primaries = childrenOf(concepts, null, sectorId);
  primaries.forEach((c, i) => {
    positions.set(c.id, rowBelow(i, primaries.length, { x: 0, y: 40 }, 230, 260));
  });
  const place = (parentId: string) => {
    const kids = childrenOf(concepts, parentId);
    kids.forEach((k, i) => positions.set(k.id, rowBelow(i, kids.length, { x: 0, y: 0 }, 190, 240)));
    kids.forEach((k) => place(k.id));
  };
  primaries.forEach((p) => place(p.id));
  return positions;
}

function linkedTo(graph: GraphPayload, id: string, conceptId: string) {
  return graph.connections.some(
    (e) =>
      (e.sourceId === id && e.targetId === conceptId) ||
      (e.targetId === id && e.sourceId === conceptId),
  );
}

function toTourElements(
  graph: GraphPayload,
  filter: string | null,
  focusId: string | null,
  memory: { openId: string | null; onEdit: (id: string) => void; onDismiss: () => void },
) {
  const now = Date.now();
  const cats = graph.concepts.filter((c) => !c.parentId);
  const showAll = filter === "__all__";
  const hubOnly = filter === null;
  const neighbor = new Set<string>();
  if (focusId) {
    neighbor.add(focusId);
    for (const e of graph.connections) {
      if (e.sourceId === focusId) neighbor.add(e.targetId);
      if (e.targetId === focusId) neighbor.add(e.sourceId);
    }
  }
  const nodes: Node[] = [
    {
      id: ME_ID,
      type: "me",
      position: { x: 0, y: 0 },
      data: { label: graph.displayName?.split(" ")[0]?.toUpperCase() || "ME" },
      draggable: false,
      selectable: false,
    },
  ];
  const conceptPos = new Map<string, { x: number; y: number }>();
  const visibleConcepts = graph.concepts.filter((c) => {
    if (hubOnly) return !c.parentId;
    if (showAll) return true;
    if (!filter) return !c.parentId;
    return c.id === filter || linkedTo(graph, c.id, filter) || c.parentId === filter;
  });
  visibleConcepts.forEach((c, i) => {
    const isCat = !c.parentId;
    let pos: { x: number; y: number };
    if (hubOnly || (showAll && isCat)) {
      pos = ring(cats.findIndex((x) => x.id === c.id), cats.length, 300);
    } else if (filter && c.id === filter) {
      pos = { x: 0, y: -40 };
    } else if (filter) {
      const siblings = visibleConcepts.filter((x) => x.id !== filter);
      const si = siblings.findIndex((x) => x.id === c.id);
      pos = ring(si, siblings.length, 170, { x: 0, y: -40 });
    } else {
      pos = ring(i, visibleConcepts.length, 220);
    }
    if (c.positionX != null && c.positionY != null) {
      pos = { x: c.positionX, y: c.positionY };
    }
    conceptPos.set(c.id, pos);
    const dimmed = Boolean(focusId && !neighbor.has(c.id) && c.id !== focusId);
    nodes.push({
      id: c.id,
      type: "concept",
      position: pos,
      data: {
        name: c.name,
        icon: c.icon,
        emoji: c.emoji,
        color: c.color,
        count: c.memoryCount,
        childCount: childrenOf(graph.concepts, c.id).length,
        dimmed,
        selected: focusId === c.id,
      },
    });
  });
  if (!hubOnly) {
    const memories = graph.memories.filter((m) => showAll || (filter && linkedTo(graph, m.id, filter)));
    const origin = filter && filter !== "__all__" ? (conceptPos.get(filter) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
    memories.forEach((m, i) => {
      const dimmed = Boolean(focusId && !neighbor.has(m.id) && m.id !== focusId);
      const created = new Date(m.createdAt).getTime();
      const recent = now - created < 1000 * 60 * 60 * 36;
      const pos =
        m.positionX != null && m.positionY != null
          ? { x: m.positionX, y: m.positionY }
          : showAll
            ? ring(i, memories.length, 520)
            : ring(i, memories.length, 280, origin);
      nodes.push({
        id: m.id,
        type: "memory",
        position: pos,
        data: {
          title: m.title,
          kind: m.nodeKind,
          importance: m.importance,
          recent,
          glow: m.accessCount >= 4 || m.importance >= 5,
          dimmed,
          emoji: m.emoji,
          color: m.color,
          expanded: memory.openId === m.id,
          onEdit: () => memory.onEdit(m.id),
          onDismiss: memory.onDismiss,
        },
      });
    });
  }
  const visible = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = [];
  for (const c of cats) {
    if (!visible.has(c.id)) continue;
    edges.push({
      id: `me-${c.id}`,
      source: ME_ID,
      target: c.id,
      style: { stroke: "rgb(136 187 216 / 42%)", strokeWidth: 1.8 },
    });
  }
  for (const e of graph.connections) {
    if (!visible.has(e.sourceId) || !visible.has(e.targetId)) continue;
    const focused = !focusId || e.sourceId === focusId || e.targetId === focusId;
    edges.push({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      style: {
        stroke: focused ? "rgb(136 187 216 / 55%)" : "rgb(136 187 216 / 16%)",
        strokeWidth: Math.max(1, e.strength * 3.2),
      },
    });
  }
  return { nodes, edges };
}

function toBranchElements(
  graph: GraphPayload,
  sectorId: string,
  branchId: string | null,
  selectedId: string | null,
  draftParent: string | null | false,
  expanded: Set<string>,
  editingId: string | null,
  sectors: BrainSector[],
  memory: { openId: string | null; onEdit: (id: string) => void; onDismiss: () => void },
) {
  const sector = sectorById(sectorId, sectors);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const now = Date.now();

  if (!branchId) {
    nodes.push({
      id: SECTOR_HUB,
      type: "sector",
      position: { x: 0, y: 0 },
      data: { label: sector.label, kicker: sector.kicker, selected: true },
      draggable: false,
    });
    const primaries = childrenOf(graph.concepts, null, sectorId);
    primaries.forEach((c, i) => {
      const pos =
        c.positionX != null && c.positionY != null
          ? { x: c.positionX, y: c.positionY }
          : rowBelow(i, primaries.length, { x: 0, y: 10 }, 210, 250);
      const kids = childrenOf(graph.concepts, c.id);
      nodes.push({
        id: c.id,
        type: "concept",
        position: pos,
        selected: selectedId === c.id,
        data: {
          name: c.name,
          icon: c.icon,
          emoji: c.emoji,
          color: c.color,
          count: c.memoryCount,
          childCount: kids.length,
          selected: selectedId === c.id,
          isEditing: editingId === c.id,
          expanded: expanded.has(c.id),
          firstLayer: true,
        },
      });
      edges.push({
        id: `hub-${c.id}`,
        source: SECTOR_HUB,
        target: c.id,
        style: {
          stroke: selectedId === c.id ? "rgb(249 197 75 / 70%)" : "rgb(136 187 216 / 45%)",
          strokeWidth: selectedId === c.id ? 2.6 : 1.6,
        },
      });
    });
    if (draftParent === false) {
      /* no preview */
    } else if (draftParent) {
      const origin = nodes.find((n) => n.id === draftParent);
      const originPos = origin?.position ?? { x: 0, y: 0 };
      nodes.push({
        id: DRAFT_ID,
        type: "concept",
        position: { x: originPos.x + 160, y: originPos.y + 40 },
        draggable: false,
        data: { name: "New sub-branch", emoji: "✨", color: "gold", count: 0, isDraft: true, selected: true },
      });
      edges.push({
        id: "draft-edge",
        source: draftParent,
        target: DRAFT_ID,
        style: { stroke: "rgb(249 197 75 / 70%)", strokeWidth: 1.6, strokeDasharray: "6 6" },
      });
    } else {
      nodes.push({
        id: DRAFT_ID,
        type: "concept",
        position: ring(primaries.length, primaries.length + 1, 240),
        draggable: false,
        data: { name: "New branch", emoji: "✨", color: "gold", count: 0, isDraft: true, selected: true },
      });
      edges.push({
        id: "draft-edge",
        source: SECTOR_HUB,
        target: DRAFT_ID,
        style: { stroke: "rgb(249 197 75 / 70%)", strokeWidth: 1.6, strokeDasharray: "6 6" },
      });
    }
    return { nodes, edges };
  }

  const current = graph.concepts.find((c) => c.id === branchId);
  if (!current) return { nodes, edges };
  const parent = current.parentId ? graph.concepts.find((c) => c.id === current.parentId) : null;
  nodes.push({
    id: current.id,
    type: "concept",
    position:
      current.positionX != null && current.positionY != null
        ? { x: current.positionX, y: current.positionY }
        : { x: 0, y: 0 },
    selected: selectedId === current.id,
    data: {
      name: current.name,
      icon: current.icon,
      emoji: current.emoji,
      color: current.color,
      count: current.memoryCount,
      childCount: childrenOf(graph.concepts, current.id).length,
      selected: selectedId === current.id,
      isParent: true,
      isEditing: editingId === current.id,
      expanded: true,
    },
  });
  const currentPos = nodes.find((n) => n.id === current.id)?.position ?? { x: 0, y: 0 };
  nodes.push({
    id: "__move_up__",
    type: "concept",
    position: { x: currentPos.x, y: currentPos.y - 200 },
    draggable: false,
    data: {
      name: "Move Up Branch",
      emoji: "⬆️",
      count: 0,
      isMoveUp: true,
    },
  });
  edges.push({
    id: "move-up-tether",
    source: current.id,
    target: "__move_up__",
    style: { stroke: "rgb(136 187 216 / 50%)", strokeWidth: 1.4, strokeDasharray: "5 6" },
  });
  const kids = childrenOf(graph.concepts, current.id);
  kids.forEach((k, i) => {
    const pos =
      k.positionX != null && k.positionY != null ? { x: k.positionX, y: k.positionY } : rowBelow(i, kids.length);
    nodes.push({
      id: k.id,
      type: "concept",
      position: pos,
      selected: selectedId === k.id,
      data: {
        name: k.name,
        icon: k.icon,
        emoji: k.emoji,
        color: k.color,
        count: k.memoryCount,
        childCount: childrenOf(graph.concepts, k.id).length,
        selected: selectedId === k.id,
        isEditing: editingId === k.id,
        expanded: expanded.has(k.id),
      },
    });
    edges.push({
      id: `${current.id}-${k.id}`,
      source: current.id,
      target: k.id,
      animated: selectedId === k.id,
      style: {
        stroke: selectedId === k.id ? "rgb(249 197 75 / 75%)" : "rgb(155 134 201 / 55%)",
        strokeWidth: selectedId === k.id ? 2.4 : 1.6,
      },
    });
  });
  const memories = graph.memories.filter((m) => linkedTo(graph, m.id, current.id));
  const hub = nodes.find((n) => n.id === current.id)?.position ?? { x: 0, y: 0 };
  memories.forEach((m, i) => {
    const created = new Date(m.createdAt).getTime();
    const chars = (m.body?.length ?? 0) + (m.transcript?.length ?? 0) + m.title.length;
    const strand = synapseLayout(chars).width * 0.78;
    const gap = 36;
    const x = hub.x - strand / 2 - gap;
    const y = hub.y + (i - (memories.length - 1) / 2) * 110;
    nodes.push({
      id: m.id,
      type: "memory",
      position: { x, y },
      draggable: false,
      data: {
        title: m.title,
        kind: m.nodeKind,
        importance: m.importance,
        recent: now - created < 1000 * 60 * 60 * 36,
        glow: m.accessCount >= 4 || m.importance >= 5,
        emoji: m.emoji,
        color: m.color,
        synapse: true,
        contentLength: (m.body?.length ?? 0) + (m.transcript?.length ?? 0) + m.title.length,
        expanded: memory.openId === m.id,
        onEdit: () => memory.onEdit(m.id),
        onDismiss: memory.onDismiss,
      },
    });
    edges.push({
      id: `mem-${m.id}`,
      source: current.id,
      target: m.id,
      animated: false,
      style: { stroke: "transparent", strokeWidth: 0 },
    });
  });
  if (typeof draftParent === "string") {
    const origin = nodes.find((n) => n.id === draftParent)?.position ?? { x: 0, y: 0 };
    nodes.push({
      id: DRAFT_ID,
      type: "concept",
      position: { x: origin.x + 150, y: origin.y + 80 },
      draggable: false,
      data: { name: "New sub-branch", emoji: "✨", color: "gold", count: 0, isDraft: true, selected: true },
    });
    edges.push({
      id: "draft-edge",
      source: draftParent,
      target: DRAFT_ID,
      style: { stroke: "rgb(249 197 75 / 75%)", strokeWidth: 1.8, strokeDasharray: "6 6" },
    });
  }
  return { nodes, edges };
}

export function MeshCanvas({
  graph,
  onSelectMemory,
  forceFilter,
  touring = false,
  guide = false,
  spotlightId,
  onGuidePick,
}: {
  graph: GraphPayload;
  onSelectMemory: (id: string) => void;
  forceFilter?: string | null;
  touring?: boolean;
  guide?: boolean;
  spotlightId?: BrainSectorId | null;
  onGuidePick?: (id: BrainSectorId) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const saved = useRef(typeof window === "undefined" ? null : loadBrainNav());
  const [sectorId, setSectorId] = useState<string | null>(
    touring || guide ? null : (saved.current?.sectorId ?? null),
  );
  const [branchId, setBranchId] = useState<string | null>(
    touring || guide ? null : (saved.current?.branchId ?? null),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    touring || guide ? null : (saved.current?.branchId ?? null),
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(touring ? [] : saved.current?.expanded ?? []),
  );
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Concept | null>(null);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tourFilter, setTourFilter] = useState<string | null>(forceFilter ?? null);
  const [tourFocus, setTourFocus] = useState<string | null>(null);
  const [openMemoryId, setOpenMemoryId] = useState<string | null>(null);
  const [sortAsk, setSortAsk] = useState(false);
  const [mounted, setMounted] = useState(false);
  const onSelectRef = useRef(onSelectMemory);
  onSelectRef.current = onSelectMemory;
  const editMemory = useCallback((id: string) => onSelectRef.current(id), []);
  const dismissMemory = useCallback(() => setOpenMemoryId(null), []);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (forceFilter !== undefined) setTourFilter(forceFilter);
  }, [forceFilter]);

  useEffect(() => {
    if (touring) return;
    saveBrainNav({
      sectorId,
      branchId,
      expanded: [...expanded],
    });
  }, [sectorId, branchId, expanded, touring]);

  const viewKey = touring
    ? `tour-${tourFilter ?? "hubs"}`
    : sectorId
      ? `s-${sectorId}-b-${branchId ?? "root"}`
      : "overview";

  const draftParent: string | null | false = composing
    ? selectedId && graph.concepts.some((c) => c.id === selectedId)
      ? selectedId
      : null
    : false;

  const built = useMemo(() => {
    const memory = { openId: openMemoryId, onEdit: editMemory, onDismiss: dismissMemory };
    if (touring) return toTourElements(graph, tourFilter, tourFocus, memory);
    if (!sectorId) return { nodes: [] as Node[], edges: [] as Edge[] };
    return toBranchElements(
      graph,
      sectorId,
      branchId,
      selectedId,
      draftParent,
      expanded,
      editing?.id ?? null,
      graph.sectors?.length ? graph.sectors : defaultSectors(),
      memory,
    );
  }, [graph, touring, tourFilter, tourFocus, sectorId, branchId, selectedId, composing, draftParent, expanded, editing, openMemoryId, editMemory, dismissMemory]);

  const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const viewRef = useRef(viewKey);
  useEffect(() => {
    const same = viewRef.current === viewKey;
    viewRef.current = viewKey;
    const local = new Map(nodesRef.current.map((n) => [n.id, n.position]));
    setNodes(built.nodes.map((n) => ({ ...n, position: same ? (local.get(n.id) ?? n.position) : n.position })));
    setEdges(built.edges);
  }, [built, viewKey, setEdges, setNodes]);

  const persist = useMutation({ mutationFn: savePositions });
  const sortMut = useMutation({
    mutationFn: async () => {
      if (!sectorId) return;
      const focus = selectedConcept?.id ?? branchId;
      const positions = layoutTree(graph.concepts, sectorId, focus);
      const nodesToSave = [...positions.entries()].map(([id, p]) => ({
        id,
        type: "concept" as const,
        x: p.x,
        y: p.y,
      }));
      if (!nodesToSave.length) return;
      await savePositions({ data: { nodes: nodesToSave } });
    },
    onSuccess: async () => {
      setSortAsk(false);
      markAccountDirty();
      toast.success("Branches arranged by hierarchy");
      await qc.invalidateQueries({ queryKey: ["graph"] });
    },
    onError: () => toast.error("Could not rearrange the branches."),
  });
  useEffect(() => {
    return registerAccountFlusher(async () => {
      const payload = nodesRef.current
        .filter((n) => n.id !== ME_ID && n.id !== SECTOR_HUB && n.id !== DRAFT_ID && n.id !== "__move_up__")
        .map((n) => ({
          id: n.id,
          type: (n.type === "concept" || n.type === "sector" ? "concept" : "memory") as "concept" | "memory",
          x: n.position.x,
          y: n.position.y,
        }))
        .filter((n) => n.type === "memory" || graph.concepts.some((c) => c.id === n.id));
      if (!payload.length) return;
      await savePositions({ data: { nodes: payload } });
    });
  }, [graph.concepts]);

  const onNodeDrag: OnNodeDrag = useCallback(
    (_e, node) => {
      if (node.type !== "concept") return;
      setNodes((nds) => {
        const mems = nds.filter((n) => n.type === "memory");
        if (!mems.length) return nds;
        return nds.map((n) => {
          if (n.type !== "memory") return n;
          const i = mems.findIndex((m) => m.id === n.id);
          const chars = (n.data as { contentLength?: number }).contentLength ?? 40;
          const strand = synapseLayout(chars).width * 0.78;
          return {
            ...n,
            position: {
              x: node.position.x - strand / 2 - 36,
              y: node.position.y + (i - (mems.length - 1) / 2) * 110,
            },
          };
        });
      });
    },
    [setNodes],
  );
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_e, node) => {
      if (node.id === ME_ID || node.id === SECTOR_HUB || node.id === DRAFT_ID || node.id === "__move_up__") return;
      markAccountDirty();
      persist.mutate({
        data: {
          nodes: [
            {
              id: node.id,
              type: node.type === "concept" ? "concept" : "memory",
              x: node.position.x,
              y: node.position.y,
            },
          ],
        },
      });
    },
    [persist],
  );

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["graph"] });
  };

  const createMut = useMutation({
    mutationFn: createBranch,
    onSuccess: async (res) => {
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      setComposing(false);
      setActionError(null);
      toast.success("Branch saved");
      markAccountDirty();
      await invalidate();
      if (res.branch) {
        setSelectedId(res.branch.id);
        if (res.branch.parentId) {
          setBranchId(res.branch.parentId);
          setExpanded((s) => new Set(s).add(res.branch!.parentId!));
        } else {
          setBranchId(null);
        }
      }
    },
  });
  const updateMut = useMutation({
    mutationFn: updateBranch,
    onSuccess: async (res) => {
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      setEditing(null);
      setActionError(null);
      toast.success("Branch updated");
      markAccountDirty();
      await invalidate();
    },
  });
  const moveMut = useMutation({
    mutationFn: moveBranch,
    onSuccess: async (res) => {
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Branch moved");
      markAccountDirty();
      await invalidate();
    },
  });
  const dupMut = useMutation({
    mutationFn: duplicateBranch,
    onSuccess: async (res) => {
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success("Branch duplicated");
      markAccountDirty();
      await invalidate();
    },
  });
  const delMut = useMutation({
    mutationFn: deleteBranch,
    onSuccess: async (res) => {
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      setEditing(null);
      setSelectedId(null);
      if (branchId && !graph.concepts.some((c) => c.id === branchId && c.id !== editing?.id)) {
        setBranchId(null);
      }
      toast.success("Branch deleted");
      markAccountDirty();
      await invalidate();
    },
  });
  const voiceMut = useMutation({
    mutationFn: createMemory,
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved to this branch");
      markAccountDirty();
      await invalidate();
    },
  });
  const sectorMut = useMutation({
    mutationFn: saveBrainSectors,
    onSuccess: async (res) => {
      if (!res.ok) {
        setActionError(res.error);
        toast.error(res.error);
        return;
      }
      setEditingSectorId(null);
      setActionError(null);
      toast.success("Main branch updated");
      markAccountDirty();
      await invalidate();
    },
  });

  const sectors = graph.sectors?.length ? graph.sectors : defaultSectors();
  const selectedConcept = graph.concepts.find((c) => c.id === selectedId) ?? null;
  const currentBranch = branchId ? graph.concepts.find((c) => c.id === branchId) ?? null : selectedConcept;
  const crumbs = breadcrumbPath(graph.concepts, sectorId, branchId, sectors);
  const addLabel = selectedConcept
    ? `Add sub-branch to ${selectedConcept.name}`
    : sectorId
      ? `Add primary branch in ${sectorById(sectorId, sectors).label}`
      : "Select a sector first";
  const editingSector = editingSectorId ? sectorById(editingSectorId, sectors) : null;

  useEffect(() => {
    function onHome() {
      setSectorId(null);
      setBranchId(null);
      setSelectedId(null);
      setComposing(false);
      setEditing(null);
      setEditingSectorId(null);
    }
    window.addEventListener("mindmesh-home", onHome);
    return () => window.removeEventListener("mindmesh-home", onHome);
  }, []);

  function goOverview() {
    setSectorId(null);
    setBranchId(null);
    setSelectedId(null);
    setComposing(false);
    setEditing(null);
    setEditingSectorId(null);
  }
  function goBack() {
    if (composing) {
      setComposing(false);
      return;
    }
    if (editing) {
      setEditing(null);
      return;
    }
    if (editingSectorId) {
      setEditingSectorId(null);
      return;
    }
    if (branchId) {
      const cur = graph.concepts.find((c) => c.id === branchId);
      if (cur?.parentId) {
        setBranchId(cur.parentId);
        setSelectedId(cur.parentId);
      } else {
        setBranchId(null);
        setSelectedId(null);
      }
      return;
    }
    if (sectorId) goOverview();
  }
  function onCrumb(crumb: Crumb) {
    if (crumb.kind === "overview") goOverview();
    else if (crumb.kind === "sector") {
      setSectorId(crumb.id);
      setBranchId(null);
      setSelectedId(null);
    } else {
      const node = graph.concepts.find((c) => c.id === crumb.id);
      setSectorId(node?.sectorId ?? sectorId);
      setBranchId(crumb.id);
      setSelectedId(crumb.id);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        goBack();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mounted) return <div className="h-full w-full bg-background" />;

  if (touring) {
    return (
      <div className="relative h-full w-full">
        <ReactFlow
          key={viewKey}
          className="mindmesh-flow"
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeOrigin={[0.5, 0.5]}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => {
            if (node.id === ME_ID) {
              setTourFocus(null);
              setTourFilter(null);
              return;
            }
            if (node.type === "memory") {
              setOpenMemoryId(node.id);
              return;
            }
            setTourFocus(node.id);
            setTourFilter((cur) => (cur === node.id ? null : node.id));
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2.4}
          colorMode="dark"
          proOptions={{ hideAttribution: false }}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgb(136 187 216 / 18%)" />
        </ReactFlow>
      </div>
    );
  }

  const showFlow = Boolean(sectorId);
  const recordPath = breadcrumbPath(graph.concepts, sectorId, selectedConcept?.id ?? branchId)
    .filter((c) => c.kind !== "overview")
    .map((c) => c.label)
    .join(" > ");

  return (
    <div className="relative flex h-full w-full flex-col">
      <NavTrail
        crumbs={crumbs}
        sectorId={sectorId}
        sectors={sectors}
        branchName={currentBranch?.name ?? selectedConcept?.name ?? null}
        onCrumb={onCrumb}
        onBack={goBack}
        onOverview={goOverview}
      />

      {showFlow && !composing && !editing && !editingSector && !selectedConcept ? (
        <div className="relative z-30 flex flex-col items-stretch gap-1.5 px-2 pb-1">
          {(() => {
            const sec = sectors.find((x) => x.id === sectorId);
            if (!sec) return null;
            const t = sectorTitle(sec);
            return (
              <div className="mx-auto flex w-full max-w-md flex-wrap items-start justify-between gap-2">
                <div className="min-w-[8rem] flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-1.5 text-white">
                  <p className="truncate text-sm font-medium">{t.anatomy} {t.emoji}{t.renamed ? ` · ${t.short}` : ""}</p>
                  {t.renamed ? <p className="truncate text-[11px] text-white/60" title={t.user}>{t.user}</p> : null}
                </div>
                <SectorGuide sector={sec} />
              </div>
            );
          })()}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-9 max-w-full px-2.5 text-xs shadow-soft"
              disabled={!sectorId}
              onClick={() => {
                setActionError(null);
                setComposing(true);
              }}
            >
              <Plus className="size-3.5" />
              <span className="truncate">{addLabel}</span>
            </Button>
            {sectorId ? (
              <Button type="button" size="sm" variant="secondary" className="h-9 px-2.5 text-xs" onClick={() => setEditingSectorId(sectorId)}>
                Edit
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="h-9 px-2.5 text-xs" onClick={() => setSortAsk(true)}>
              Sort
            </Button>
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Select a branch to record into it.
          </p>
        </div>
      ) : null}

      {showFlow && selectedConcept && !composing && !editing && !editingSector ? (
        <div className="relative z-30 flex flex-wrap items-center justify-end gap-1.5 px-2 pb-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11"
            onClick={() => {
              setActionError(null);
              setComposing(true);
            }}
          >
            <Plus className="size-4" />
            Add sub-branch
          </Button>
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setSortAsk(true)}>
            Auto sort
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(selectedConcept)}>
            Edit {selectedConcept.name}
          </Button>
        </div>
      ) : null}


      <div className="relative min-h-0 flex-1">
      {!showFlow ? (
        <BrainOverview
          concepts={graph.concepts}
          sectors={sectors}
          spotlightId={guide ? (spotlightId ?? "frontal") : null}
          guide={guide}
          onGuidePick={onGuidePick}
          onOpenSector={(id: BrainSectorId) => {
            setSectorId(id);
            setBranchId(null);
            setSelectedId(null);
          }}
          onOpenBranch={(sector, branch) => {
            setSectorId(sector);
            setBranchId(branch);
            setSelectedId(branch);
          }}
          onEditSector={(id: BrainSectorId) => {
            setActionError(null);
            setEditingSectorId(id);
          }}
        />
      ) : (
        <ReactFlow
          key={viewKey}
          className={cn("mindmesh-flow h-full", "brain-depth")}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeOrigin={[0.5, 0.5]}
          nodeTypes={nodeTypes}
          onNodeClick={(_e, node) => {
            if (node.id === DRAFT_ID) return;
            if (node.id === "__move_up__") {
              const cur = branchId ? graph.concepts.find((c) => c.id === branchId) : null;
              const up = cur?.parentId ?? null;
              setBranchId(up);
              setSelectedId(up);
              return;
            }
            if (node.id === SECTOR_HUB) {
              setSelectedId(null);
              return;
            }
            if (node.type === "memory") {
              setOpenMemoryId(node.id);
              return;
            }
            const concept = graph.concepts.find((c) => c.id === node.id);
            if (!concept) return;
            setSelectedId(concept.id);
          }}
          onNodeDoubleClick={(_e, node) => {
            if (node.id === DRAFT_ID || node.type === "memory") return;
            if (node.id === SECTOR_HUB) {
              setBranchId(null);
              setSelectedId(null);
              return;
            }
            const concept = graph.concepts.find((c) => c.id === node.id);
            if (!concept) return;
            setSelectedId(concept.id);
            setSectorId(concept.sectorId);
            setBranchId(concept.id);
            setExpanded((s) => new Set(s).add(concept.id));
          }}
          onPaneClick={() => {
            if (!composing) setSelectedId(branchId);
          }}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.28, duration: 420 }}
          minZoom={0.45}
          maxZoom={2.2}
          translateExtent={[
            [-1400, -900],
            [1400, 1600],
          ]}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnDrag
          panOnScroll={false}
          preventScrolling
          colorMode="dark"
          proOptions={{ hideAttribution: false }}
          nodesConnectable={false}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgb(136 187 216 / 18%)" />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(n) => {
              if (n.type === "me" || n.type === "sector") return "var(--color-highlight)";
              if (n.type === "concept") return "var(--color-primary)";
              const kind = (n.data as { kind?: keyof typeof KIND_COLOR }).kind;
              return kind ? KIND_COLOR[kind] : "var(--color-learning)";
            }}
            maskColor="rgb(0 23 28 / 55%)"
          />
        </ReactFlow>
      )}
      </div>

      {!showFlow && !touring ? (
        <button
          type="button"
          onClick={() => navigate({ to: "/capture" })}
          className="absolute bottom-24 right-4 z-20 flex size-14 items-center justify-center rounded-full bg-highlight text-highlight-foreground shadow-soft md:bottom-8 md:right-8"
          aria-label="Capture a thought"
        >
          <Plus className="size-6" />
        </button>
      ) : null}

      {composing && sectorId ? (
        <BranchComposer
          sectorId={sectorId}
          sectors={sectors}
          parent={selectedConcept && selectedConcept.id !== SECTOR_HUB ? selectedConcept : null}
          pending={createMut.isPending}
          error={actionError}
          onCancel={() => {
            setComposing(false);
            setActionError(null);
          }}
          onSave={(input) => {
            createMut.mutate({
              data: {
                name: input.name,
                description: input.description,
                parentId: selectedConcept?.id ?? null,
                sectorId,
                emoji: input.emoji,
                color: input.color,
              },
            });
          }}
        />
      ) : null}

      {editing ? (
        <BranchSheet
          branch={editing}
          concepts={graph.concepts}
          sectors={sectors}
          pending={updateMut.isPending || moveMut.isPending || dupMut.isPending || delMut.isPending}
          error={actionError}
          onClose={() => {
            setEditing(null);
            setActionError(null);
          }}
          onSave={(input) =>
            updateMut.mutate({
              data: { id: editing.id, ...input },
            })
          }
          onMove={(input) =>
            moveMut.mutate({
              data: { id: editing.id, parentId: input.parentId, sectorId: input.sectorId },
            })
          }
          onDuplicate={(includeChildren) =>
            dupMut.mutate({ data: { id: editing.id, includeChildren } })
          }
          onDelete={(mode) => delMut.mutate({ data: { id: editing.id, mode } })}
        />
      ) : null}

      {editingSector ? (
        <SectorEditor
          sector={editingSector}
          pending={sectorMut.isPending}
          error={actionError}
          onCancel={() => {
            setEditingSectorId(null);
            setActionError(null);
          }}
          onSave={(input) => {
            const next = sectors.map((s) =>
              s.id === editingSector.id
                ? { ...s, label: input.label, kicker: input.kicker, emoji: input.emoji, color: input.color, named: true }
                : s,
            );
            sectorMut.mutate({ data: { sectors: next } });
          }}
        />
      ) : null}

      {showFlow && selectedConcept && !composing && !editing && !editingSector ? (
        <RecordDock
          key={selectedConcept.id}
          pathLabel={recordPath || selectedConcept.name}
          memories={graph.memories.filter((m) => linkedTo(graph, m.id, selectedConcept.id))}
          pending={voiceMut.isPending}
          onOpenMemory={onSelectMemory}
          onSave={(input) => {
            voiceMut.mutate({
              data: {
                title: input.transcript.slice(0, 80) || "Voice note",
                body: input.transcript || "Voice note",
                memoryType: "voice",
                transcript: input.transcript || null,
                mediaUrl: input.mediaUrl,
                mediaMime: input.mediaMime,
                mediaName: input.mediaName,
                conceptId: selectedConcept.id,
              },
            });
          }}
          onSaveNote={(input) => {
            voiceMut.mutate({
              data: {
                title: input.title,
                body: input.body,
                memoryType: "text",
                conceptId: selectedConcept.id,
              },
            });
          }}
          onSaveFile={(input) => {
            voiceMut.mutate({
              data: {
                title: input.title,
                body: input.body || input.title,
                aiSummary: input.aiSummary,
                memoryType: "document",
                mediaUrl: input.mediaUrl,
                mediaMime: input.mediaMime,
                mediaName: input.mediaName,
                conceptId: selectedConcept.id,
              },
            });
          }}
        />
      ) : null}
      {sortAsk ? (
        <div className="absolute inset-0 z-40 grid place-items-end bg-background/55 p-4 md:place-items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-soft" role="dialog" aria-labelledby="sort-title">
            <h2 id="sort-title" className="font-display text-xl">Replace this arrangement?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Auto sort throws away the positions you dragged and lays only the branches in the view you are looking at under their parent.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setSortAsk(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={sortMut.isPending} onClick={() => sortMut.mutate()}>
                {sortMut.isPending ? "Sorting…" : "Sort branches"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
