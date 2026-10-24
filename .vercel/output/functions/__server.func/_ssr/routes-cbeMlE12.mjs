import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { x as useNavigate, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, n as useQuery, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { n as cn, r as formatDate } from "./utils-KYK7ILYy.mjs";
import { a as NODE_KINDS, n as EMOTIONS } from "./types-DAtvk6Qj.mjs";
import { A as Flame, B as BookOpen, D as Heart, L as Building2, N as Dumbbell, O as Handshake, R as Briefcase, S as ListChecks, T as KeyRound, V as Activity, _ as Plus, f as Sparkle, g as Receipt, h as Scale, i as Users, j as Flag, n as Wallet, s as Target, t as X, v as Plane, z as Brain } from "../_libs/lucide-react.mjs";
import { c as registerAccountFlusher, s as markAccountDirty } from "./router-JzWW0JG9.mjs";
import { r as createSsrRpc, t as AppShell } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as RequireAuth } from "./require-auth-C-MSc5Vn.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { t as Input } from "./input-RcJ0F5Jz.mjs";
import { n as nodeColorCss, t as NODE_COLORS } from "./node-colors-CZ-tbA2V.mjs";
import { t as TagEditor } from "./tag-editor-BCpF9bTN.mjs";
import { c as suggestMemoryTags, i as getMemory, l as updateMemory, n as deleteMemory, o as savePositions, r as getGraph } from "./memories-DLH5CEI3.mjs";
import { n as GlyphRow, t as CapturePanel } from "./capture-panel-D_8zTHYg.mjs";
import { a as Stars, i as KIND_TONE, n as KIND_COLOR, r as KIND_LABEL, t as Badge } from "./stars-BLjsm7i7.mjs";
import { a as MiniMap, c as useNodesState, i as Handle, l as Position, n as BackgroundVariant, o as index, r as Controls, s as useEdgesState, t as Background } from "../_libs/@xyflow/react+[...].mjs";
import { n as AnimatePresence, t as motion } from "../_libs/framer-motion+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-cbeMlE12.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var CONCEPT_ICONS = {
	flag: Flag,
	building: Building2,
	briefcase: Briefcase,
	heart: Heart,
	activity: Activity,
	wallet: Wallet,
	plane: Plane,
	brain: Brain,
	dumbbell: Dumbbell,
	book: BookOpen,
	users: Users,
	handshake: Handshake,
	scale: Scale,
	spark: Sparkle,
	receipt: Receipt,
	flame: Flame,
	list: ListChecks,
	key: KeyRound,
	target: Target
};
function MeNode({ data }) {
	const d = data;
	const label = d.label.length > 8 ? d.label.slice(0, 8) : d.label;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative flex flex-col items-center",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Top
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Bottom
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative size-[88px]",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "animate-pulse-ring absolute inset-0 rounded-full bg-highlight/25" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "animate-pulse-ring absolute inset-2 rounded-full bg-highlight/20",
						style: { animationDelay: "0.8s" }
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "animate-me-breathe relative flex size-[88px] items-center justify-center rounded-full border border-highlight/50 bg-secondary px-2 text-center text-sm font-semibold tracking-[0.18em] text-highlight shadow-[0_0_32px_rgb(249_197_75/0.35)]",
						children: label
					})
				]
			})
		]
	});
}
function ConceptNode({ data }) {
	const d = data;
	const Icon = d.icon && CONCEPT_ICONS[d.icon] || CONCEPT_ICONS.brain;
	const ring = nodeColorCss(d.color);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("relative flex flex-col items-center", d.dimmed && "opacity-25"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Top
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Bottom
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex size-16 items-center justify-center rounded-full border bg-card text-primary shadow-[0_0_18px_rgb(136_187_216/0.2)]",
				style: { borderColor: ring },
				children: d.emoji ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-2xl leading-none",
					children: d.emoji
				}) : Icon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-6" }) : null
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 max-w-28 text-center",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "truncate text-xs font-medium text-foreground",
					children: d.name
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-[10px] tabular-nums text-muted-foreground",
					children: [
						d.count,
						" ",
						d.count === 1 ? "memory" : "memories"
					]
				})]
			})
		]
	});
}
function MemoryNode({ data }) {
	const d = data;
	const size = 36 + d.importance * 6;
	const color = d.color ? nodeColorCss(d.color) : KIND_COLOR[d.kind];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("relative flex flex-col items-center", d.dimmed && "opacity-20"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "target",
				position: Position.Top
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Handle, {
				type: "source",
				position: Position.Bottom
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: cn("grid place-items-center rounded-full border", d.recent && "animate-node-pulse"),
				style: {
					width: size,
					height: size,
					background: color,
					borderColor: "rgb(0 23 28 / 40%)",
					boxShadow: d.glow ? `0 0 ${10 + d.importance * 4}px ${color}` : `0 0 10px color-mix(in oklab, ${color} 40%, transparent)`
				},
				children: d.emoji ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-sm leading-none",
					children: d.emoji
				}) : null
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-1.5 max-w-[132px] text-center text-[11px] leading-snug text-foreground/90",
				children: d.title
			})
		]
	});
}
var nodeTypes = {
	me: MeNode,
	concept: ConceptNode,
	memory: MemoryNode
};
var ME_ID = "me";
function ring(index, total, radius, origin = {
	x: 0,
	y: 0
}) {
	const angle = index / Math.max(total, 1) * Math.PI * 2 - Math.PI / 2;
	return {
		x: origin.x + Math.cos(angle) * radius,
		y: origin.y + Math.sin(angle) * radius
	};
}
function toElements(graph, filter, focusId) {
	const now = Date.now();
	const cats = graph.concepts.filter((c) => c.kind === "category");
	const showAll = filter === "__all__";
	const hubOnly = filter === null;
	const neighbor = /* @__PURE__ */ new Set();
	if (focusId) {
		neighbor.add(focusId);
		for (const e of graph.connections) {
			if (e.sourceId === focusId) neighbor.add(e.targetId);
			if (e.targetId === focusId) neighbor.add(e.sourceId);
		}
	}
	const linkedTo = (id, conceptId) => graph.connections.some((e) => e.sourceId === id && e.targetId === conceptId || e.targetId === id && e.sourceId === conceptId);
	const nodes = [{
		id: ME_ID,
		type: "me",
		position: {
			x: 0,
			y: 0
		},
		data: { label: graph.displayName?.split(" ")[0]?.toUpperCase() || "ME" },
		draggable: false,
		selectable: false
	}];
	const conceptPos = /* @__PURE__ */ new Map();
	const visibleConcepts = graph.concepts.filter((c) => {
		if (hubOnly) return c.kind === "category";
		if (showAll) return true;
		if (!filter) return c.kind === "category";
		return c.id === filter || linkedTo(c.id, filter);
	});
	visibleConcepts.forEach((c, i) => {
		const isCat = c.kind === "category";
		let pos;
		if (hubOnly || showAll && isCat) pos = ring(cats.findIndex((x) => x.id === c.id), cats.length, 300);
		else if (filter && c.id === filter) pos = {
			x: 0,
			y: -40
		};
		else if (filter) {
			const siblings = visibleConcepts.filter((x) => x.id !== filter);
			pos = ring(siblings.findIndex((x) => x.id === c.id), siblings.length, 170, {
				x: 0,
				y: -40
			});
		} else pos = ring(i, visibleConcepts.length, 220);
		if (c.positionX != null && c.positionY != null && (hubOnly || showAll)) pos = {
			x: c.positionX,
			y: c.positionY
		};
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
				dimmed
			}
		});
	});
	if (!hubOnly) {
		const memories = graph.memories.filter((m) => showAll || filter && linkedTo(m.id, filter));
		const origin = filter && filter !== "__all__" ? conceptPos.get(filter) ?? {
			x: 0,
			y: 0
		} : {
			x: 0,
			y: 0
		};
		memories.forEach((m, i) => {
			const dimmed = Boolean(focusId && !neighbor.has(m.id) && m.id !== focusId);
			const created = new Date(m.createdAt).getTime();
			const recent = now - created < 1296e5;
			const pos = showAll && m.positionX != null && m.positionY != null ? {
				x: m.positionX,
				y: m.positionY
			} : showAll ? ring(i, memories.length, 520) : ring(i, memories.length, 280, origin);
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
					color: m.color
				}
			});
		});
	}
	const visible = new Set(nodes.map((n) => n.id));
	const edges = [];
	for (const c of cats) {
		if (!visible.has(c.id)) continue;
		edges.push({
			id: `me-${c.id}`,
			source: ME_ID,
			target: c.id,
			style: {
				stroke: "rgb(136 187 216 / 42%)",
				strokeWidth: 1.8
			}
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
				strokeWidth: Math.max(1, e.strength * 3.2)
			}
		});
	}
	return {
		nodes,
		edges
	};
}
function MeshCanvas({ graph, onSelectMemory, forceFilter, touring = false }) {
	const [filter, setFilter] = (0, import_react.useState)(forceFilter ?? null);
	const [focusId, setFocusId] = (0, import_react.useState)(null);
	const [mounted, setMounted] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setMounted(true), []);
	(0, import_react.useEffect)(() => {
		if (forceFilter !== void 0) setFilter(forceFilter);
	}, [forceFilter]);
	const built = (0, import_react.useMemo)(() => toElements(graph, filter, focusId), [
		graph,
		filter,
		focusId
	]);
	const [nodes, setNodes, onNodesChange] = useNodesState(built.nodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(built.edges);
	const nodesRef = (0, import_react.useRef)(nodes);
	nodesRef.current = nodes;
	const filterRef = (0, import_react.useRef)(filter);
	(0, import_react.useEffect)(() => {
		const sameView = filterRef.current === filter;
		filterRef.current = filter;
		const local = new Map(nodesRef.current.map((n) => [n.id, n.position]));
		setNodes(built.nodes.map((n) => ({
			...n,
			position: sameView ? local.get(n.id) ?? n.position : n.position
		})));
		setEdges(built.edges);
	}, [
		built,
		filter,
		setEdges,
		setNodes
	]);
	const persist = useMutation({ mutationFn: savePositions });
	(0, import_react.useEffect)(() => {
		return registerAccountFlusher(async () => {
			const payload = nodesRef.current.filter((n) => n.id !== ME_ID).map((n) => ({
				id: n.id,
				type: n.type === "concept" ? "concept" : "memory",
				x: n.position.x,
				y: n.position.y
			}));
			if (!payload.length) return;
			await savePositions({ data: { nodes: payload } });
		});
	}, []);
	const onNodeDragStop = (0, import_react.useCallback)((_e, node) => {
		if (node.id === ME_ID) return;
		markAccountDirty();
		persist.mutate({ data: { nodes: [{
			id: node.id,
			type: node.type === "concept" ? "concept" : "memory",
			x: node.position.x,
			y: node.position.y
		}] } });
	}, [persist]);
	const categories = graph.concepts.filter((c) => c.kind === "category");
	if (!mounted) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-full w-full bg-background" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative h-full w-full",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(index, {
			className: "mindmesh-flow",
			nodes,
			edges,
			onNodesChange,
			onEdgesChange,
			nodeOrigin: [.5, .5],
			nodeTypes,
			onNodeClick: (_e, node) => {
				if (node.id === ME_ID) {
					setFocusId(null);
					setFilter(null);
					return;
				}
				if (node.type === "memory") {
					setFocusId(node.id);
					onSelectMemory(node.id);
				} else {
					setFocusId(node.id);
					setFilter((cur) => cur === node.id ? null : node.id);
				}
			},
			onPaneClick: () => {
				setFocusId(null);
			},
			onNodeDragStop,
			fitView: true,
			fitViewOptions: { padding: .2 },
			minZoom: .2,
			maxZoom: 2.4,
			colorMode: "dark",
			proOptions: { hideAttribution: false },
			nodesConnectable: false,
			deleteKeyCode: null,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Background, {
					variant: BackgroundVariant.Dots,
					gap: 28,
					size: 1,
					color: "rgb(136 187 216 / 18%)"
				}),
				!touring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Controls, {
					showInteractive: false,
					position: "bottom-left"
				}) : null,
				!touring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MiniMap, {
					position: "bottom-right",
					pannable: true,
					zoomable: true,
					nodeColor: (n) => {
						if (n.type === "me") return "var(--color-highlight)";
						if (n.type === "concept") return "var(--color-primary)";
						const kind = n.data.kind;
						return kind ? KIND_COLOR[kind] : "var(--color-learning)";
					},
					maskColor: "rgb(0 23 28 / 55%)"
				}) : null
			]
		}, filter ?? "hubs"), !touring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4 md:top-5",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "pointer-events-auto flex max-w-[min(100%,920px)] items-center gap-1.5 overflow-x-auto rounded-xl border border-border bg-background/70 p-1.5 backdrop-blur-md scrollbar-none",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setFilter(null);
							setFocusId(null);
						},
						className: `shrink-0 rounded-lg px-3 py-1.5 text-xs ${filter === null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`,
						children: "Hubs"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setFilter("__all__");
							setFocusId(null);
						},
						className: `shrink-0 rounded-lg px-3 py-1.5 text-xs ${filter === "__all__" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`,
						children: "All"
					}),
					categories.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setFilter((cur) => cur === c.id ? null : c.id),
						className: `shrink-0 rounded-lg px-3 py-1.5 text-xs ${filter === c.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground"}`,
						children: c.name
					}, c.id))
				]
			})
		}) : null]
	});
}
function MemorySheet({ memoryId, onClose }) {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: ["memory", memoryId],
		queryFn: () => getMemory({ data: memoryId })
	});
	const m = q.data;
	const save = useMutation({
		mutationFn: updateMemory,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["memory", memoryId] });
			qc.invalidateQueries({ queryKey: ["graph"] });
		}
	});
	const suggest = useMutation({
		mutationFn: suggestMemoryTags,
		onSuccess: (res) => {
			if (!m) return;
			save.mutate({ data: {
				id: m.id,
				tags: res.tags
			} });
		}
	});
	const remove = useMutation({
		mutationFn: () => deleteMemory({ data: memoryId }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["graph"] });
			onClose();
		}
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		className: "absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-border bg-background/95 shadow-soft backdrop-blur-md",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center justify-between border-b border-border px-5 py-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-[11px] font-medium uppercase tracking-[0.18em] text-primary",
				children: "Memory"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: onClose,
				className: "flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
				"aria-label": "Close",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex-1 overflow-y-auto px-5 py-5",
			children: q.isPending || !m ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-6 w-2/3 animate-pulse rounded bg-muted" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-24 animate-pulse rounded-lg bg-muted" })]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
						tone: KIND_TONE[m.nodeKind],
						children: KIND_LABEL[m.nodeKind]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-muted-foreground",
						children: formatDate(m.createdAt)
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-3 font-display text-2xl font-medium tracking-tight",
					children: m.title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRow, {
						emoji: m.emoji || "✨",
						color: m.color || "cyan",
						onEmoji: (emoji) => save.mutate({ data: {
							id: m.id,
							emoji
						} }),
						onColor: (color) => save.mutate({ data: {
							id: m.id,
							color
						} })
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stars, {
						value: m.importance,
						size: "md",
						onChange: (n) => save.mutate({ data: {
							id: m.id,
							importance: n
						} })
					}), m.emotion ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm text-muted-foreground",
						children: m.emotion
					}) : null]
				}),
				m.aiSummary ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 rounded-lg border border-border bg-card px-3 py-3 text-sm text-foreground/90",
					children: m.aiSummary
				}) : null,
				m.sourceUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
					href: m.sourceUrl,
					target: "_blank",
					rel: "noreferrer",
					className: "mt-3 inline-block text-sm text-primary hover:underline",
					children: ["Open source", m.sourceKind ? ` · ${m.sourceKind}` : ""]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 max-h-[min(28rem,50vh)] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/85",
					children: m.body
				}),
				m.transcript ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
						children: "Transcript"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm italic text-foreground/80",
						children: m.transcript
					})]
				}) : null,
				m.mediaUrl && m.mediaMime?.startsWith("audio/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
					className: "mt-4 w-full",
					controls: true,
					src: m.mediaUrl
				}) : null,
				m.mediaUrl && m.mediaMime?.startsWith("image/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: m.mediaUrl,
					alt: "",
					className: "mt-4 max-h-56 w-full rounded-lg object-cover"
				}) : null,
				m.mediaUrl && m.mediaMime?.startsWith("video/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
					className: "mt-4 w-full rounded-lg",
					controls: true,
					src: m.mediaUrl
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-5",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagEditor, {
						tags: m.tags,
						onChange: (tags) => save.mutate({ data: {
							id: m.id,
							tags
						} }),
						onSuggest: () => suggest.mutate({ data: {
							memoryId: m.id,
							existing: m.tags
						} }),
						suggesting: suggest.isPending
					})
				}),
				m.concepts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
						children: "Connected concepts"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 flex flex-wrap gap-1.5",
						children: m.concepts.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: c.name }, c.id))
					})]
				}) : null,
				m.related.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
						children: "Related memories"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-2 space-y-1",
						children: m.related.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/memory/$id",
							params: { id: r.id },
							className: "text-sm text-primary hover:underline",
							children: r.title
						}) }, r.id))
					})]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-6 grid gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
							children: "Emotion"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap gap-1",
							children: EMOTIONS.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => save.mutate({ data: {
									id: m.id,
									emotion: e
								} }),
								className: `rounded-full px-2.5 py-1 text-xs ${m.emotion === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`,
								children: e
							}, e))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "mt-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
							children: "Kind"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex flex-wrap gap-1",
							children: NODE_KINDS.map((k) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => save.mutate({ data: {
									id: m.id,
									nodeKind: k
								} }),
								className: `rounded-full px-2.5 py-1 text-xs ${m.nodeKind === k ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`,
								children: KIND_LABEL[k]
							}, k))
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-8 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/memory/$id",
						params: { id: m.id },
						className: "text-sm text-primary",
						children: "Open full page"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						onClick: () => remove.mutate(),
						children: "Remove"
					})]
				})
			] })
		})]
	});
}
var startWalkthrough = createServerFn({ method: "POST" }).validator((input) => {
	const name = input.name.trim();
	if (name.length < 1 || name.length > 80) throw new Error("Name is required");
	const age = Number(input.age);
	if (!Number.isFinite(age) || age < 1 || age > 120) throw new Error("Enter a real age");
	const maps = input.maps.map((m) => ({
		name: m.name.trim(),
		emoji: (m.emoji || "🧠").slice(0, 8),
		color: NODE_COLORS.some((c) => c.id === m.color) ? m.color : "cyan"
	})).filter((m) => m.name.length > 0).slice(0, 8);
	if (maps.length < 2) throw new Error("Add at least two mind maps");
	return {
		name,
		age: Math.round(age),
		maps
	};
}).middleware([authMiddleware]).handler(createSsrRpc("73ccd3627138f8dbcf2f36cddb0685ef638eabe769d3983759fe5dd5457790f3"));
var finishWalkthrough = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("1b347c4c9d05656677a38bbdd15f38d88e6f139fe503f09d9186eb6480df3160"));
function firstName(full) {
	const n = full.trim().split(/\s+/)[0] || "";
	if (!n || n.toUpperCase() === "ME") return "there";
	return n;
}
function exampleFor(mapName, index) {
	if (index === 0) return {
		title: `A ${mapName} lesson I don't want to lose`,
		body: `Today I noticed something about ${mapName} that I want future-me to remember. Slow down. Write the actual detail.`
	};
	return {
		title: `What ${mapName} taught me`,
		body: `A second node on ${mapName}: the pattern I keep returning to, and why it matters.`
	};
}
function Walkthrough({ graph, onDone }) {
	const qc = useQueryClient();
	const cats = graph.concepts.filter((c) => c.kind === "category");
	const initialPhase = cats.length < 2 ? "profile" : graph.memories.length >= 2 ? "reveal" : "spotlight";
	const [phase, setPhase] = (0, import_react.useState)(initialPhase);
	const [name, setName] = (0, import_react.useState)(graph.displayName === "ME" ? "" : graph.displayName);
	const [age, setAge] = (0, import_react.useState)("");
	const [maps, setMaps] = (0, import_react.useState)([{
		name: "",
		emoji: "🧠",
		color: "cyan"
	}, {
		name: "",
		emoji: "💡",
		color: "gold"
	}]);
	const [error, setError] = (0, import_react.useState)(null);
	const [nodeIndex, setNodeIndex] = (0, import_react.useState)(Math.min(graph.memories.length, 1));
	const [captureTarget, setCaptureTarget] = (0, import_react.useState)(null);
	const pendingMap = (0, import_react.useMemo)(() => {
		return cats.find((c) => c.memoryCount === 0) ?? cats[cats.length - 1] ?? null;
	}, [cats]);
	const saveMaps = useMutation({
		mutationFn: startWalkthrough,
		onSuccess: async () => {
			setNodeIndex(0);
			setCaptureTarget(null);
			await qc.invalidateQueries({ queryKey: ["graph"] });
			setPhase("spotlight");
		},
		onError: (err) => setError(err instanceof Error ? err.message : "Could not save")
	});
	const finish = useMutation({
		mutationFn: () => finishWalkthrough(),
		onSuccess: async () => {
			await qc.invalidateQueries({ queryKey: ["graph"] });
			onDone();
		}
	});
	function submitProfile(e) {
		e.preventDefault();
		setError(null);
		saveMaps.mutate({ data: {
			name,
			age: Number(age),
			maps
		} });
	}
	const spotlightTarget = pendingMap;
	const target = phase === "capture" ? captureTarget : spotlightTarget;
	const example = target ? exampleFor(target.name, nodeIndex) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnimatePresence, { children: phase === "profile" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(motion.div, {
			className: "fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-background/80 px-4 py-8 backdrop-blur-sm",
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			exit: {
				opacity: 0,
				y: -8
			},
			transition: { duration: .2 },
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(motion.form, {
				onSubmit: submitProfile,
				className: "w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-soft",
				initial: {
					opacity: 0,
					y: 12,
					filter: "blur(4px)"
				},
				animate: {
					opacity: 1,
					y: 0,
					filter: "blur(0px)"
				},
				transition: {
					duration: .25,
					ease: [
						.22,
						1,
						.36,
						1
					]
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] font-medium uppercase tracking-[0.2em] text-primary",
						children: "First mesh"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-2 font-display text-3xl",
						children: "Tell the mesh who you are"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: "Two maps to start. You can grow infinitely from there."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-5 space-y-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mb-1.5 block text-xs text-muted-foreground",
								children: "Please provide your name."
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								name: "displayName",
								placeholder: "Your name",
								value: name,
								onChange: (e) => setName(e.target.value),
								autoComplete: "name",
								required: true
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "block",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "mb-1.5 block text-xs text-muted-foreground",
								children: "Please provide your age."
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								name: "age",
								placeholder: "Your age",
								type: "number",
								min: 1,
								max: 120,
								value: age,
								onChange: (e) => setAge(e.target.value),
								required: true
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-6 text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
						children: "List at least two mind maps you want to build"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 space-y-3",
						children: maps.map((m, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl border border-border bg-background/40 p-3",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "mb-2 flex items-center justify-between",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "text-xs text-muted-foreground",
										children: ["Map ", i + 1]
									}), maps.length > 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "flex size-8 items-center justify-center text-muted-foreground hover:text-foreground",
										onClick: () => setMaps(maps.filter((_, j) => j !== i)),
										"aria-label": "Remove map",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
									}) : null]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
									name: `map-${i}`,
									placeholder: i === 0 ? "Golf, Real estate, Family…" : "A second world you think in",
									value: m.name,
									onChange: (e) => {
										const next = [...maps];
										next[i] = {
											...m,
											name: e.target.value
										};
										setMaps(next);
									},
									required: true
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-2",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRow, {
										emoji: m.emoji,
										color: m.color,
										onEmoji: (emoji) => {
											const next = [...maps];
											next[i] = {
												...m,
												emoji
											};
											setMaps(next);
										},
										onColor: (color) => {
											const next = [...maps];
											next[i] = {
												...m,
												color
											};
											setMaps(next);
										}
									})
								})
							]
						}, i))
					}),
					maps.length < 6 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "mt-3 text-sm text-primary hover:underline",
						onClick: () => setMaps([...maps, {
							name: "",
							emoji: "✨",
							color: NODE_COLORS[maps.length % NODE_COLORS.length].id
						}]),
						children: "Add another map"
					}) : null,
					error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-xs text-problem",
						children: error
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "mt-5 w-full",
						type: "submit",
						disabled: saveMaps.isPending,
						children: saveMaps.isPending ? "Building your mesh…" : "Save and open the mesh"
					})
				]
			})
		}, "profile") : null }),
		phase === "spotlight" && spotlightTarget ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spotlight, {
			who: firstName(graph.displayName),
			mapName: spotlightTarget.name,
			index: nodeIndex,
			onPlus: () => {
				setCaptureTarget(spotlightTarget);
				setPhase("capture");
			}
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnimatePresence, { children: phase === "capture" && target && example ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(motion.div, {
			className: "fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm md:items-center",
			initial: { opacity: 0 },
			animate: { opacity: 1 },
			exit: { opacity: 0 },
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(motion.div, {
				className: "w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-soft",
				initial: {
					opacity: 0,
					y: 16
				},
				animate: {
					opacity: 1,
					y: 0
				},
				exit: {
					opacity: 0,
					y: 8
				},
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-4 flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-primary",
						children: [
							"Node ",
							nodeIndex + 1,
							" of 2"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "Name it. Capture it."
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "flex size-10 items-center justify-center text-muted-foreground hover:text-foreground",
						onClick: () => setPhase("spotlight"),
						"aria-label": "Close",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-5" })
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CapturePanel, {
					defaultMode: "text",
					guide: {
						mapName: target.name,
						conceptId: target.id,
						exampleTitle: example.title,
						exampleBody: example.body
					},
					onCreated: () => {
						const next = nodeIndex + 1;
						setNodeIndex(next);
						setCaptureTarget(null);
						setPhase(next >= 2 ? "reveal" : "spotlight");
					}
				}, `${target.id}-${nodeIndex}`)]
			})
		}, "capture") : null }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnimatePresence, { children: phase === "reveal" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(motion.div, {
			className: "pointer-events-none fixed inset-x-0 top-6 z-40 flex justify-center px-4",
			initial: {
				opacity: 0,
				y: 8
			},
			animate: {
				opacity: 1,
				y: 0
			},
			exit: { opacity: 0 },
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-card/95 p-5 text-center shadow-soft backdrop-blur-md",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-primary",
						children: "The mesh grows"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "mt-2 font-display text-2xl",
						children: "That is how a map expands"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: "Your node fans out from its hub. Click a map to open it. Capture anything — the web around you gets denser every day."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "mt-4 w-full",
						onClick: () => finish.mutate(),
						disabled: finish.isPending,
						children: finish.isPending ? "Opening…" : "Enter my mesh"
					})
				]
			})
		}, "reveal") : null })
	] });
}
function Spotlight({ who, mapName, index, onPlus }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "fixed inset-0 z-40",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "absolute inset-0 bg-background/60" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "absolute bottom-36 left-1/2 w-[min(100%-2rem,20rem)] -translate-x-1/2 rounded-2xl border border-border bg-card p-4 shadow-soft md:bottom-32",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-highlight",
						children: index === 0 ? "Your first node" : "One more"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mt-1 font-display text-xl",
						children: index === 0 ? `Hey ${who} — this is how you create a new node.` : `Click the plus for your ${mapName} node.`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted-foreground",
						children: index === 0 ? "Hey, click the plus sign for this first node. Then pick a capture method, name it, and give it an icon and color." : "Same motion. Pick how you capture it, name it however you wish, and save."
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				onClick: onPlus,
				"data-tour": "plus",
				className: cn("absolute bottom-8 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-highlight text-highlight-foreground shadow-soft md:right-8", "ring-4 ring-highlight/40 transition-transform duration-150 ease-out active:scale-[0.96]"),
				"aria-label": "Create a new node",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-0 animate-pulse-ring rounded-full bg-highlight/40" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "relative size-6" })]
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireAuth, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MeshPage, {}) });
}
function MeshPage() {
	const navigate = useNavigate();
	const [openId, setOpenId] = (0, import_react.useState)(null);
	const q = useQuery({
		queryKey: ["graph"],
		queryFn: () => getGraph()
	});
	const touring = Boolean(q.data && !q.data.onboarded);
	const expandHub = touring && q.data && q.data.memories.length >= 2 ? q.data.concepts.filter((c) => c.kind === "category" && c.memoryCount > 0).at(-1)?.id ?? "__all__" : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {
		bleed: true,
		locked: touring,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "relative h-dvh w-full overflow-hidden",
			children: [
				q.isError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-full place-items-center px-6 text-center",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-display text-2xl",
							children: "Couldn’t open your mesh"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-2 text-sm text-muted-foreground",
							children: q.error instanceof Error ? q.error.message : "The network didn’t load."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							className: "mt-4",
							onClick: () => void q.refetch(),
							children: "Try again"
						})
					] })
				}) : q.isPending || !q.data ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid h-full place-items-center",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted-foreground",
						children: "Growing your network…"
					})
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MeshCanvas, {
					graph: q.data,
					onSelectMemory: setOpenId,
					forceFilter: expandHub,
					touring
				}),
				openId && !touring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemorySheet, {
					memoryId: openId,
					onClose: () => setOpenId(null)
				}) : null,
				q.data && touring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Walkthrough, {
					graph: q.data,
					onDone: () => void q.refetch()
				}) : null,
				!touring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => navigate({ to: "/capture" }),
					className: "absolute bottom-24 right-4 z-20 flex size-14 items-center justify-center rounded-full bg-highlight text-highlight-foreground shadow-soft md:bottom-8 md:right-8",
					"aria-label": "Capture a thought",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-6" })
				}) : null
			]
		})
	});
}
//#endregion
export { Home as component };
