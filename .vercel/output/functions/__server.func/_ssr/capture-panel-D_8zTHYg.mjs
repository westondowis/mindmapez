import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { a as require_jsx_runtime, i as useQueryClient, t as useMutation } from "../_libs/react+tanstack__react-query.mjs";
import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { n as cn, t as blobToDataUrl } from "./utils-KYK7ILYy.mjs";
import { C as Link2, E as Image, F as ClipboardPaste, M as FileText, a as Type, b as Mic, k as FolderOpen, r as Video, t as X, u as Square } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { c as registerAccountFlusher, s as markAccountDirty } from "./router-JzWW0JG9.mjs";
import { a as formatTextStat, c as ingestFiles, d as readSystemClipboard, f as subscribeImport, i as formatBytes, l as ingestTextBlock, n as canDropImport, o as ingestClipboardEvent, r as createSsrRpc, s as ingestDataTransfer, u as pickFilesFromDevice } from "./createSsrRpc-B8lW_4O7.mjs";
import { t as Button } from "./button-DpEjrIC3.mjs";
import { n as Textarea, t as Input } from "./input-RcJ0F5Jz.mjs";
import { t as NODE_COLORS } from "./node-colors-CZ-tbA2V.mjs";
import { t as TagEditor } from "./tag-editor-BCpF9bTN.mjs";
import { c as suggestMemoryTags, t as createMemory } from "./memories-DLH5CEI3.mjs";
import { n as getAccountDraft, r as saveAccountDraft, t as clearAccountDraft } from "./persist-Cbg-Rdx4.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/capture-panel-D_8zTHYg.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var EMOJI_GROUPS = [
	{
		id: "mind",
		label: "Mind",
		glyphs: [
			"🧠",
			"💭",
			"💡",
			"🔮",
			"🎯",
			"🧩",
			"🪞",
			"🌀",
			"⚡",
			"✨",
			"🌟",
			"🪐",
			"🪄",
			"🧿",
			"🧘",
			"🕯️"
		]
	},
	{
		id: "people",
		label: "People",
		glyphs: [
			"😀",
			"🙂",
			"😎",
			"🤔",
			"😴",
			"🤩",
			"😇",
			"🧑",
			"👩",
			"👨",
			"🧒",
			"👶",
			"🧓",
			"🤝",
			"🫂",
			"💬",
			"🗣️",
			"👀"
		]
	},
	{
		id: "work",
		label: "Work",
		glyphs: [
			"💼",
			"💻",
			"📊",
			"📈",
			"📉",
			"📁",
			"🗂️",
			"📌",
			"📎",
			"📝",
			"📅",
			"🗓️",
			"☎️",
			"📧",
			"🏢",
			"🏦",
			"🏗️",
			"🧑‍💼"
		]
	},
	{
		id: "money",
		label: "Money",
		glyphs: [
			"💰",
			"💵",
			"💴",
			"💶",
			"💷",
			"💳",
			"🏦",
			"💎",
			"🪙",
			"📉",
			"📈",
			"🧾",
			"🏠",
			"🔑",
			"📜"
		]
	},
	{
		id: "health",
		label: "Health",
		glyphs: [
			"❤️",
			"💪",
			"🧘",
			"🏃",
			"🚴",
			"🥗",
			"🍎",
			"💊",
			"🩺",
			"🧬",
			"🦷",
			"🧠",
			"😴",
			"🧊",
			"☀️"
		]
	},
	{
		id: "sport",
		label: "Sport",
		glyphs: [
			"⛳",
			"🏌️",
			"⚽️",
			"🏀",
			"🏈",
			"⚾️",
			"🎾",
			"🏐",
			"🏉",
			"🥏",
			"🎳",
			"🥊",
			"🥋",
			"🏊",
			"🏄",
			"⛷️",
			"🏂",
			"🏆"
		]
	},
	{
		id: "travel",
		label: "Travel",
		glyphs: [
			"✈️",
			"🌍",
			"🌎",
			"🌏",
			"🗺️",
			"🧳",
			"🧭",
			"🏔️",
			"🏖️",
			"🏝️",
			"🏕️",
			"🗼",
			"🗽",
			"🚗",
			"🚆",
			"🚢",
			"🚁"
		]
	},
	{
		id: "home",
		label: "Home",
		glyphs: [
			"🏠",
			"🏡",
			"👨‍👩‍👧",
			"🐕",
			"🐈",
			"🪴",
			"🍳",
			"🛋️",
			"🛏️",
			"🧹",
			"🛠️",
			"🔧",
			"🪵",
			"🚪",
			"🔑"
		]
	},
	{
		id: "nature",
		label: "Nature",
		glyphs: [
			"🌿",
			"🌳",
			"🌲",
			"🌸",
			"🌺",
			"🌻",
			"🍀",
			"🌊",
			"🔥",
			"❄️",
			"🌈",
			"🌙",
			"⭐",
			"☀️",
			"☁️",
			"🌧️"
		]
	},
	{
		id: "food",
		label: "Food",
		glyphs: [
			"☕️",
			"🍵",
			"🥐",
			"🍞",
			"🧀",
			"🍕",
			"🍔",
			"🍣",
			"🥗",
			"🍎",
			"🫐",
			"🍫",
			"🍯",
			"🍷",
			"🍺"
		]
	},
	{
		id: "learn",
		label: "Learn",
		glyphs: [
			"📚",
			"📖",
			"✏️",
			"🎓",
			"🔬",
			"🔭",
			"🧪",
			"🧮",
			"🎨",
			"🎬",
			"🎵",
			"🎹",
			"🎧",
			"📰",
			"🖋️"
		]
	},
	{
		id: "symbols",
		label: "Marks",
		glyphs: [
			"❤️",
			"🧡",
			"💛",
			"💚",
			"💙",
			"💜",
			"🖤",
			"🤍",
			"✅",
			"❌",
			"⚠️",
			"❓",
			"❗",
			"➡️",
			"⭐",
			"🔥",
			"💎",
			"🛡️"
		]
	},
	{
		id: "time",
		label: "Time",
		glyphs: [
			"⏰",
			"📅",
			"⏳",
			"⌛",
			"🕒",
			"🌙",
			"☀️",
			"🌅",
			"🌇",
			"🌌",
			"🔁",
			"📌",
			"🎉",
			"🎂"
		]
	},
	{
		id: "life",
		label: "Life",
		glyphs: [
			"🐶",
			"🐱",
			"🦁",
			"🐯",
			"🦊",
			"🐼",
			"🐨",
			"🐸",
			"🦋",
			"🐝",
			"🐢",
			"🐬",
			"🐳",
			"🦅",
			"🌸"
		]
	}
];
var ALL_EMOJI = EMOJI_GROUPS.flatMap((g) => g.glyphs);
var KEYWORDS = {
	golf: ["⛳", "🏌️"],
	house: ["🏠", "🏡"],
	home: [
		"🏠",
		"🏡",
		"🔑"
	],
	money: [
		"💰",
		"💵",
		"💳"
	],
	work: [
		"💼",
		"💻",
		"📊"
	],
	family: [
		"👨‍👩‍👧",
		"🫂",
		"🏠"
	],
	health: [
		"❤️",
		"💪",
		"🧘"
	],
	idea: [
		"💡",
		"✨",
		"🧠"
	],
	travel: [
		"✈️",
		"🧳",
		"🗺️"
	],
	love: [
		"❤️",
		"💛",
		"🫂"
	]
};
function searchEmoji(query) {
	const q = query.trim().toLowerCase();
	if (!q) return ALL_EMOJI;
	const hits = /* @__PURE__ */ new Set();
	for (const [word, glyphs] of Object.entries(KEYWORDS)) if (word.includes(q) || q.includes(word)) for (const g of glyphs) hits.add(g);
	for (const group of EMOJI_GROUPS) if (group.label.toLowerCase().includes(q) || group.id.includes(q)) for (const g of group.glyphs) hits.add(g);
	return hits.size ? [...hits] : ALL_EMOJI;
}
function EmojiPicker({ value, onChange }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [group, setGroup] = (0, import_react.useState)("mind");
	const root = (0, import_react.useRef)(null);
	const glyphs = (0, import_react.useMemo)(() => {
		if (query.trim()) return searchEmoji(query);
		return EMOJI_GROUPS.find((g) => g.id === group)?.glyphs ?? EMOJI_GROUPS[0].glyphs;
	}, [query, group]);
	(0, import_react.useEffect)(() => {
		function onDoc(e) {
			if (!root.current?.contains(e.target)) setOpen(false);
		}
		document.addEventListener("mousedown", onDoc);
		return () => document.removeEventListener("mousedown", onDoc);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: root,
		className: "relative",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: () => setOpen((v) => !v),
			className: "flex size-11 items-center justify-center rounded-md border border-input bg-card text-xl",
			"aria-label": "Choose an icon",
			children: value || "✨"
		}), open ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "absolute z-50 mt-2 w-[min(100vw-2rem,20rem)] rounded-xl border border-border bg-popover p-3 shadow-soft",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					placeholder: "Search icons…",
					value: query,
					onChange: (e) => setQuery(e.target.value),
					autoFocus: true
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 flex gap-1 overflow-x-auto scrollbar-none",
					children: EMOJI_GROUPS.map((g) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setGroup(g.id);
							setQuery("");
						},
						className: cn("shrink-0 rounded-md px-2 py-1 text-[11px]", group === g.id && !query ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"),
						children: g.label
					}, g.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 grid max-h-48 grid-cols-8 gap-1 overflow-y-auto",
					children: glyphs.map((g, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							onChange(g);
							setOpen(false);
						},
						className: cn("grid size-8 place-items-center rounded-md text-lg hover:bg-primary/15", value === g && "bg-primary/20"),
						children: g
					}, `${g}-${i}`))
				})
			]
		}) : null]
	});
}
function ColorSwatches({ value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-wrap gap-1.5",
		role: "listbox",
		"aria-label": "Color",
		children: NODE_COLORS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			title: c.label,
			onClick: () => onChange(c.id),
			className: cn("size-9 rounded-full border-2 transition-transform duration-150 ease-out active:scale-[0.96]", value === c.id ? "border-foreground scale-110" : "border-transparent"),
			style: { background: c.css },
			"aria-label": c.label
		}, c.id))
	});
}
function GlyphRow({ emoji, color, onEmoji, onColor }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmojiPicker, {
			value: emoji,
			onChange: onEmoji
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorSwatches, {
			value: color,
			onChange: onColor
		})]
	});
}
var extractLink = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("b76ef1005841a5b1c876bea974f1cf5aa761a2db91060eec6f3a8072381878b1"));
var MODES = [
	{
		id: "voice",
		label: "Voice",
		icon: Mic
	},
	{
		id: "text",
		label: "Text",
		icon: Type
	},
	{
		id: "link",
		label: "Link",
		icon: Link2
	},
	{
		id: "thought",
		label: "Thought",
		icon: Type
	},
	{
		id: "photo",
		label: "Photo",
		icon: Image
	},
	{
		id: "video",
		label: "Video",
		icon: Video
	},
	{
		id: "document",
		label: "File",
		icon: FileText
	}
];
function isBareUrl(value) {
	return /^https?:\/\/\S+$/i.test(value.trim());
}
function kindToMode(kind) {
	if (kind === "link") return "link";
	if (kind === "photo") return "photo";
	if (kind === "video") return "video";
	if (kind === "voice") return "voice";
	if (kind === "document") return "document";
	return "text";
}
function CapturePanel({ onCreated, defaultMode = "voice", guide, seed }) {
	const qc = useQueryClient();
	const [mode, setMode] = (0, import_react.useState)(defaultMode);
	const [title, setTitle] = (0, import_react.useState)("");
	const [body, setBody] = (0, import_react.useState)("");
	const [transcript, setTranscript] = (0, import_react.useState)("");
	const [mediaUrl, setMediaUrl] = (0, import_react.useState)(null);
	const [mediaMime, setMediaMime] = (0, import_react.useState)(null);
	const [mediaName, setMediaName] = (0, import_react.useState)(null);
	const [emoji, setEmoji] = (0, import_react.useState)(guide ? "💡" : "✨");
	const [color, setColor] = (0, import_react.useState)(guide ? "gold" : "cyan");
	const [tags, setTags] = (0, import_react.useState)([]);
	const [sourceUrl, setSourceUrl] = (0, import_react.useState)("");
	const [sourceKind, setSourceKind] = (0, import_react.useState)(null);
	const [extractWarning, setExtractWarning] = (0, import_react.useState)(null);
	const [extractedSite, setExtractedSite] = (0, import_react.useState)(null);
	const [transcriptFound, setTranscriptFound] = (0, import_react.useState)(false);
	const [recording, setRecording] = (0, import_react.useState)(false);
	const [restored, setRestored] = (0, import_react.useState)(false);
	const [queue, setQueue] = (0, import_react.useState)([]);
	const [dropHover, setDropHover] = (0, import_react.useState)(false);
	const [batch, setBatch] = (0, import_react.useState)(null);
	const recRef = (0, import_react.useRef)(null);
	const chunks = (0, import_react.useRef)([]);
	const speechRef = (0, import_react.useRef)(null);
	const skipDraft = (0, import_react.useRef)(false);
	const recordingRef = (0, import_react.useRef)(false);
	const fileRef = (0, import_react.useRef)(null);
	const seedUsed = (0, import_react.useRef)(false);
	recordingRef.current = recording;
	const snapshot = () => ({
		mode,
		title,
		body,
		transcript,
		mediaUrl,
		mediaMime,
		mediaName,
		tags,
		emoji,
		color,
		sourceUrl,
		sourceKind
	});
	const snapshotRef = (0, import_react.useRef)(snapshot);
	snapshotRef.current = snapshot;
	const hasContent = () => Boolean(title.trim() || body.trim() || transcript.trim() || mediaUrl || sourceUrl.trim());
	const save = useMutation({
		mutationFn: createMemory,
		onSuccess: async (res) => {
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			toast.success("Captured into the mesh");
			skipDraft.current = true;
			setTitle("");
			setBody("");
			setTranscript("");
			setMediaUrl(null);
			setMediaMime(null);
			setMediaName(null);
			setTags([]);
			setSourceUrl("");
			setSourceKind(null);
			setExtractWarning(null);
			setExtractedSite(null);
			setTranscriptFound(false);
			await clearAccountDraft();
			await qc.invalidateQueries({ queryKey: ["graph"] });
			await qc.invalidateQueries({ queryKey: ["dashboard"] });
			await qc.invalidateQueries({ queryKey: ["memories"] });
			onCreated?.(res.memory.id);
		},
		onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save that memory")
	});
	const pull = useMutation({
		mutationFn: extractLink,
		onSuccess: (res) => {
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			setTitle(res.organized.title);
			setBody(res.organized.summary || res.extracted.body);
			setTranscript(res.extracted.transcript ?? "");
			setTags(res.organized.tags);
			setSourceUrl(res.extracted.url);
			setSourceKind(res.extracted.sourceKind);
			setExtractWarning(res.extracted.warning);
			setExtractedSite(res.extracted.site);
			setTranscriptFound(res.extracted.transcriptFound);
			toast.success(res.extracted.transcriptFound ? "Pulled the public transcript into your mesh" : "Pulled the page into your mesh");
		},
		onError: () => toast.error("Couldn’t read that link")
	});
	const suggest = useMutation({
		mutationFn: suggestMemoryTags,
		onSuccess: (res) => setTags(res.tags)
	});
	function applyItemToForm(item) {
		if (item.warning && !item.body && !item.mediaUrl && !item.sourceUrl) {
			toast.error(item.warning);
			return;
		}
		if (item.warning) toast.message(item.warning);
		setMode(kindToMode(item.kind));
		if (item.title) setTitle((prev) => prev.trim() || item.title);
		if (item.body) setBody(item.body);
		if (item.mediaUrl) {
			setMediaUrl(item.mediaUrl);
			setMediaMime(item.mediaMime);
			setMediaName(item.mediaName);
		} else if (item.mediaName) {
			setMediaName(item.mediaName);
			setMediaMime(item.mediaMime);
		}
		if (item.sourceUrl) {
			setSourceUrl(item.sourceUrl);
			setMode("link");
		}
	}
	const applyItemsRef = (0, import_react.useRef)(() => {});
	applyItemsRef.current = (items) => {
		const usable = items.filter((item) => item.body || item.mediaUrl || item.sourceUrl || item.warning);
		if (!usable.length) return;
		for (const item of usable) if (item.warning && !item.body && !item.mediaUrl && !item.sourceUrl) toast.error(item.warning);
		const ready = usable.filter((item) => item.body || item.mediaUrl || item.sourceUrl);
		if (!ready.length) return;
		if (ready.length === 1 && ready[0].kind === "text" && ready[0].body) {
			const item = ready[0];
			if (item.warning) toast.message(item.warning);
			setMode("text");
			setBody((prev) => prev.trim() ? `${prev.trim()}\n\n${item.body}` : item.body);
			if (item.title) setTitle((prev) => prev.trim() || item.title);
			if (item.mediaName) setMediaName(item.mediaName);
			toast.success(`Ready · ${formatTextStat(item.body)}`);
			return;
		}
		if (ready.length === 1 && ready[0].kind === "link" && ready[0].sourceUrl) {
			setMode("link");
			setSourceUrl(ready[0].sourceUrl);
			pull.mutate({ data: {
				url: ready[0].sourceUrl,
				tags
			} });
			return;
		}
		if (!Boolean(title.trim() || body.trim() || transcript.trim() || mediaUrl || sourceUrl.trim())) {
			applyItemToForm(ready[0]);
			setQueue((q) => [...q, ...ready.slice(1)]);
		} else setQueue((q) => [...q, ...ready]);
		toast.success(ready.length === 1 ? `Imported ${ready[0].mediaName || ready[0].title}` : `Imported ${ready.length} files`);
	};
	(0, import_react.useEffect)(() => {
		let cancelled = false;
		getAccountDraft().then((d) => {
			if (cancelled || restored || !d.capture) {
				setRestored(true);
				return;
			}
			const c = d.capture;
			if (c.title || c.body || c.transcript || c.mediaUrl || c.sourceUrl) {
				setMode(c.mode || defaultMode);
				setTitle(c.title);
				setBody(c.body);
				setTranscript(c.transcript);
				setMediaUrl(c.mediaUrl);
				setMediaMime(c.mediaMime);
				setMediaName(c.mediaName);
				setTags(c.tags ?? []);
				setEmoji(c.emoji || "✨");
				setColor(c.color || "cyan");
				setSourceUrl(c.sourceUrl || "");
				toast.message("Restored an unsaved capture from this account");
			}
			setRestored(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (!restored || seedUsed.current) return;
		if (!seed?.title && !seed?.body && !seed?.sourceUrl) return;
		seedUsed.current = true;
		const items = [];
		if (seed.sourceUrl) items.push(ingestTextBlock(seed.sourceUrl));
		else if (seed.body) {
			const item = ingestTextBlock(seed.body);
			if (seed.title) item.title = seed.title;
			items.push(item);
		} else if (seed.title) setTitle(seed.title);
		if (items.length) applyItemsRef.current(items);
	}, [
		restored,
		seed?.title,
		seed?.body,
		seed?.sourceUrl
	]);
	(0, import_react.useEffect)(() => {
		return subscribeImport((items) => applyItemsRef.current(items));
	}, []);
	(0, import_react.useEffect)(() => {
		return () => {
			recRef.current?.stop();
			speechRef.current?.stop();
			const draft = snapshotRef.current();
			if (skipDraft.current) return;
			if (draft.title || draft.body || draft.transcript || draft.mediaUrl || draft.sourceUrl) saveAccountDraft({ data: { capture: draft } });
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (!restored || skipDraft.current) return;
		markAccountDirty();
		const t = window.setTimeout(() => {
			if (!hasContent()) {
				saveAccountDraft({ data: { capture: null } });
				return;
			}
			saveAccountDraft({ data: { capture: snapshot() } });
		}, 1400);
		return () => window.clearTimeout(t);
	}, [
		mode,
		title,
		body,
		transcript,
		mediaUrl,
		mediaMime,
		mediaName,
		tags,
		emoji,
		color,
		sourceUrl,
		restored
	]);
	(0, import_react.useEffect)(() => {
		return registerAccountFlusher(async () => {
			if (recordingRef.current) stopVoice();
			const draft = snapshotRef.current();
			if (Boolean(draft.title.trim() || draft.body.trim() || draft.transcript.trim() || draft.mediaUrl || draft.sourceUrl.trim())) await saveAccountDraft({ data: { capture: draft } });
			else await saveAccountDraft({ data: { capture: null } });
		});
	});
	(0, import_react.useEffect)(() => {
		function isTypingTarget(el) {
			if (!(el instanceof HTMLElement)) return false;
			const tag = el.tagName;
			return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
		}
		async function onPaste(e) {
			const typing = isTypingTarget(e.target);
			const dt = e.clipboardData;
			const hasFiles = Boolean(dt && (dt.files.length || Array.from(dt.items ?? []).some((i) => i.kind === "file")));
			if (typing && !hasFiles) return;
			if (!dt) return;
			const items = await ingestClipboardEvent(e);
			if (!items.length) return;
			if (hasFiles || !typing) {
				e.preventDefault();
				applyItemsRef.current(items);
			}
		}
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, []);
	async function startVoice() {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const rec = new MediaRecorder(stream);
		chunks.current = [];
		rec.ondataavailable = (e) => {
			if (e.data.size) chunks.current.push(e.data);
		};
		rec.onstop = async () => {
			stream.getTracks().forEach((t) => t.stop());
			const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
			const url = await blobToDataUrl(blob);
			setMediaUrl(url);
			setMediaMime(blob.type || "audio/webm");
			setMediaName("voice-note.webm");
			markAccountDirty();
		};
		rec.start();
		recRef.current = rec;
		setRecording(true);
		const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
		if (SR) {
			const recog = new SR();
			recog.continuous = true;
			recog.interimResults = true;
			recog.lang = "en-US";
			recog.onresult = (ev) => {
				let final = "";
				for (let i = ev.resultIndex; i < ev.results.length; i++) {
					const piece = ev.results[i];
					if (!piece) continue;
					final += piece[0].transcript;
					if (piece.isFinal) setTranscript((t) => t ? `${t} ${piece[0].transcript}` : piece[0].transcript);
				}
				if (final) setBody(final);
			};
			recog.start();
			speechRef.current = recog;
		}
	}
	function stopVoice() {
		recRef.current?.stop();
		speechRef.current?.stop();
		recRef.current = null;
		speechRef.current = null;
		setRecording(false);
	}
	async function importFromFiles() {
		const picked = await pickFilesFromDevice();
		if (picked === "cancelled") return;
		if (picked === "fallback") {
			fileRef.current?.click();
			return;
		}
		applyItemsRef.current(await ingestFiles(picked));
	}
	async function pasteFromClipboard() {
		try {
			const items = await readSystemClipboard();
			if (!items.length) {
				toast.message("Clipboard is empty — copy something, then paste.");
				return;
			}
			applyItemsRef.current(items);
		} catch {
			toast.error("Allow clipboard access, or paste with Cmd/Ctrl+V.");
		}
	}
	async function onDropped(dt) {
		applyItemsRef.current(await ingestDataTransfer(dt));
	}
	function payloadFromForm() {
		const text = body.trim() || transcript.trim();
		const memoryType = mode === "link" || sourceUrl ? "link" : mode === "thought" ? "thought" : mode;
		return {
			title: title.trim() || void 0,
			body: text || title || mediaName || sourceUrl || "Captured memory",
			memoryType,
			transcript: transcript.trim() || null,
			mediaUrl,
			mediaMime,
			mediaName,
			emoji,
			color,
			tags,
			sourceUrl: sourceUrl.trim() || (isBareUrl(body) ? body.trim() : null),
			sourceKind,
			conceptId: guide?.conceptId ?? null
		};
	}
	function payloadFromItem(item) {
		const memoryType = item.kind === "link" ? "link" : item.kind;
		return {
			title: item.title || void 0,
			body: item.body || item.title || item.mediaName || item.sourceUrl || "Imported memory",
			memoryType,
			transcript: null,
			mediaUrl: item.mediaUrl,
			mediaMime: item.mediaMime,
			mediaName: item.mediaName,
			emoji,
			color,
			tags,
			sourceUrl: item.sourceUrl,
			sourceKind: item.kind === "link" ? sourceKind : null,
			conceptId: guide?.conceptId ?? null
		};
	}
	function submit() {
		if (mode === "link" || isBareUrl(body) || isBareUrl(sourceUrl)) {
			const url = sourceUrl.trim() || body.trim();
			if (!title.trim() && url && !pull.data) {
				pull.mutate({ data: {
					url,
					tags
				} });
				return;
			}
		}
		if (!(body.trim() || transcript.trim()) && !mediaUrl && !sourceUrl.trim()) {
			toast.error("Add a thought, recording, link, or file first.");
			return;
		}
		save.mutate({ data: payloadFromForm() });
	}
	async function saveAll() {
		const payloads = [];
		if (hasContent()) payloads.push(payloadFromForm());
		for (const item of queue) if (item.body || item.mediaUrl || item.sourceUrl) payloads.push(payloadFromItem(item));
		if (!payloads.length) {
			toast.error("Nothing to save yet.");
			return;
		}
		setBatch({
			total: payloads.length,
			done: 0
		});
		let lastId = null;
		let failed = 0;
		for (let i = 0; i < payloads.length; i++) {
			const payload = payloads[i];
			if (!payload) continue;
			try {
				const res = await createMemory({ data: payload });
				if (!res.ok) {
					failed += 1;
					toast.error(res.error);
				} else lastId = res.memory.id;
			} catch (err) {
				failed += 1;
				toast.error(err instanceof Error ? err.message : "Could not save a file");
			}
			setBatch({
				total: payloads.length,
				done: i + 1
			});
		}
		skipDraft.current = true;
		setTitle("");
		setBody("");
		setTranscript("");
		setMediaUrl(null);
		setMediaMime(null);
		setMediaName(null);
		setTags([]);
		setSourceUrl("");
		setSourceKind(null);
		setQueue([]);
		setBatch(null);
		await clearAccountDraft();
		await qc.invalidateQueries({ queryKey: ["graph"] });
		await qc.invalidateQueries({ queryKey: ["dashboard"] });
		await qc.invalidateQueries({ queryKey: ["memories"] });
		if (failed && failed === payloads.length) return;
		toast.success(failed ? `Saved ${payloads.length - failed} of ${payloads.length} into the mesh` : `Saved ${payloads.length} into the mesh`);
		if (lastId) onCreated?.(lastId);
	}
	const bodyStat = formatTextStat(body);
	const busy = save.isPending || pull.isPending || Boolean(batch);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto w-full max-w-xl",
		children: [
			guide ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mb-4 text-sm text-muted-foreground",
				children: [
					"This node will live on ",
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-foreground",
						children: guide.mapName
					}),
					". Pick how you want to capture it."
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-wrap gap-1 rounded-xl border border-border bg-card/70 p-1",
				children: MODES.map((m) => {
					const Icon = m.icon;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setMode(m.id),
						className: cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-xs", mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-3.5" }), m.label]
					}, m.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
				ref: fileRef,
				type: "file",
				className: "hidden",
				multiple: true,
				onChange: (e) => {
					const files = e.target.files;
					if (files?.length) ingestFiles(files).then((items) => applyItemsRef.current(items));
					e.target.value = "";
				}
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				onDragEnter: (e) => {
					if (!canDropImport(e.dataTransfer)) return;
					e.preventDefault();
					setDropHover(true);
				},
				onDragOver: (e) => {
					if (!canDropImport(e.dataTransfer)) return;
					e.preventDefault();
					e.dataTransfer.dropEffect = "copy";
					setDropHover(true);
				},
				onDragLeave: (e) => {
					if (e.currentTarget.contains(e.relatedTarget)) return;
					setDropHover(false);
				},
				onDrop: (e) => {
					e.preventDefault();
					e.stopPropagation();
					setDropHover(false);
					onDropped(e.dataTransfer);
				},
				className: cn("mt-4 rounded-xl border border-dashed bg-card/50 p-4 transition-colors", dropHover ? "border-primary bg-primary/10" : "border-border"),
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-foreground",
						children: "Bring it in from anywhere"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: "Files app, another app, a photo, or a long paste. Drop it here or paste with Cmd/Ctrl+V."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex flex-wrap gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "secondary",
							className: "min-h-11",
							onClick: () => void importFromFiles(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { className: "size-4" }), "Import from Files"]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "outline",
							className: "min-h-11",
							onClick: () => void pasteFromClipboard(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipboardPaste, { className: "size-4" }), "Paste"]
						})]
					})
				]
			}),
			queue.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-3 rounded-xl border border-border bg-card/70 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-muted-foreground",
						children: [
							queue.length,
							" more file",
							queue.length === 1 ? "" : "s",
							" waiting"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "text-xs text-muted-foreground hover:text-foreground",
						onClick: () => setQueue([]),
						children: "Clear"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-2 space-y-1.5",
					children: queue.map((item, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-2 text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "min-w-0 truncate text-foreground",
							children: [item.mediaName || item.title || "Untitled", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "ml-2 text-xs text-muted-foreground",
								children: [item.kind, item.bytes ? ` · ${formatBytes(item.bytes)}` : ""]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground",
							"aria-label": "Remove file",
							onClick: () => setQueue((q) => q.filter((_, idx) => idx !== i)),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-3.5" })
						})]
					}, `${item.mediaName ?? item.title}-${i}`))
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-2 text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
					children: "Icon, color, and name — yours to choose"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(GlyphRow, {
					emoji,
					color,
					onEmoji: setEmoji,
					onColor: setColor
				})]
			}),
			guide ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "mt-4 w-full rounded-xl border border-dashed border-border bg-card/50 p-3 text-left",
				onClick: () => {
					setTitle(guide.exampleTitle);
					setBody(guide.exampleBody);
					setMode("text");
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
						children: "Try an example"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-foreground",
						children: guide.exampleTitle
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-0.5 text-xs text-muted-foreground",
						children: guide.exampleBody
					})
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-6",
				children: mode === "voice" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col items-center gap-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => recording ? stopVoice() : void startVoice(),
							className: cn("relative flex size-28 items-center justify-center rounded-full border border-primary/40 bg-secondary text-primary shadow-soft", recording && "bg-problem/20 text-problem"),
							"aria-label": recording ? "Stop recording" : "Start recording",
							children: [recording ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-0 animate-pulse-ring rounded-full bg-problem/30" }) : null, recording ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Square, { className: "size-8 fill-current" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mic, { className: "size-10" })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted-foreground",
							children: recording ? "Listening — press to stop" : "Press to record. Speak naturally."
						}),
						mediaUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
							controls: true,
							src: mediaUrl,
							className: "w-full"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							placeholder: "Transcript appears here. You can edit it. It is saved to your account.",
							value: transcript || body,
							onChange: (e) => {
								setTranscript(e.target.value);
								setBody(e.target.value);
							}
						})
					]
				}) : mode === "link" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							name: "sourceUrl",
							type: "url",
							placeholder: "Paste a podcast, article, or YouTube link",
							value: sourceUrl,
							onChange: (e) => setSourceUrl(e.target.value)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "secondary",
							className: "w-full",
							disabled: pull.isPending || !sourceUrl.trim(),
							onClick: () => pull.mutate({ data: {
								url: sourceUrl.trim(),
								tags
							} }),
							children: pull.isPending ? "Reading the page…" : "Pull into the mesh"
						}),
						extractedSite ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs text-muted-foreground",
							children: [
								"From ",
								extractedSite,
								transcriptFound ? " · public transcript found" : " · no public transcript"
							]
						}) : null,
						extractWarning ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-gold",
							children: extractWarning
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							name: "nodeTitle",
							placeholder: "Name this node",
							value: title,
							onChange: (e) => setTitle(e.target.value)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							placeholder: "What should the mesh remember from this?",
							name: "nodeBody",
							value: body,
							onChange: (e) => setBody(e.target.value)
						}),
						transcript ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							placeholder: "Transcript",
							value: transcript,
							onChange: (e) => setTranscript(e.target.value),
							className: "min-h-28"
						}) : null
					]
				}) : mode === "photo" || mode === "video" || mode === "document" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-4 text-sm text-muted-foreground hover:border-primary/40",
							onDragOver: (e) => {
								if (!canDropImport(e.dataTransfer)) return;
								e.preventDefault();
							},
							onDrop: (e) => {
								e.preventDefault();
								e.stopPropagation();
								onDropped(e.dataTransfer);
							},
							children: [
								"Drop from Files or another app, or tap to choose a ",
								mode,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "file",
									className: "hidden",
									multiple: true,
									accept: mode === "photo" ? "image/*" : mode === "video" ? "video/*" : void 0,
									onChange: (e) => {
										const files = e.target.files;
										if (files?.length) ingestFiles(files).then((items) => applyItemsRef.current(items));
										e.target.value = "";
									}
								})
							]
						}),
						mediaUrl && mediaMime?.startsWith("image/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: mediaUrl,
							alt: "",
							className: "max-h-48 w-full rounded-lg object-cover"
						}) : null,
						mediaUrl && mediaMime?.startsWith("video/") ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
							src: mediaUrl,
							controls: true,
							className: "w-full rounded-lg"
						}) : null,
						mediaName ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs text-muted-foreground",
							children: mediaName
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							name: "nodeTitle",
							placeholder: "Name this node",
							value: title,
							onChange: (e) => setTitle(e.target.value)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							placeholder: "What should the mesh remember about this?",
							name: "nodeBody",
							value: body,
							onChange: (e) => setBody(e.target.value)
						})
					]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							name: "nodeTitle",
							placeholder: "Name this node",
							value: title,
							onChange: (e) => setTitle(e.target.value)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Textarea, {
							name: "nodeBody",
							placeholder: mode === "thought" ? "A quick thought. One sentence is enough." : "Write in your own words, or paste a long note, article, or transcript…",
							value: body,
							onChange: (e) => setBody(e.target.value),
							className: cn(mode === "thought" ? "min-h-24" : "min-h-40", body.length > 1200 && "min-h-64", body.length > 6e3 && "min-h-[50vh] max-h-[70vh]")
						}),
						body.length > 280 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs tabular-nums text-muted-foreground",
							children: bodyStat
						}) : null,
						isBareUrl(body) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "secondary",
							onClick: () => {
								setMode("link");
								setSourceUrl(body.trim());
								pull.mutate({ data: {
									url: body.trim(),
									tags
								} });
							},
							disabled: pull.isPending,
							children: pull.isPending ? "Reading the page…" : "This looks like a link — pull it in"
						}) : null
					]
				})
			}),
			mode !== "text" && mode !== "thought" && body.length > 280 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-xs tabular-nums text-muted-foreground",
				children: bodyStat
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-5",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TagEditor, {
					tags,
					onChange: setTags,
					onSuggest: () => suggest.mutate({ data: {
						text: [
							title,
							body,
							transcript
						].filter(Boolean).join("\n").slice(0, 8e3),
						existing: tags
					} }),
					suggesting: suggest.isPending
				})
			}),
			queue.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-5 w-full",
				size: "lg",
				onClick: () => void saveAll(),
				disabled: busy,
				children: batch ? `Saving ${batch.done} of ${batch.total}…` : `Save ${queue.length + (hasContent() ? 1 : 0)} into the mesh`
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				className: "mt-5 w-full",
				size: "lg",
				onClick: submit,
				disabled: busy,
				children: save.isPending ? "Weaving into the mesh…" : "Save node"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-center text-xs text-muted-foreground",
				children: "Saved to this account. Signing out writes any unsaved recording first."
			})
		]
	});
}
//#endregion
export { GlyphRow as n, CapturePanel as t };
