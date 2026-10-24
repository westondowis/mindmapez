import { o as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { f as useRouterState, x as useNavigate, y as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { a as getServerFnById, i as TSS_SERVER_FUNCTION } from "./ssr.mjs";
import { n as cn } from "./utils-KYK7ILYy.mjs";
import { I as CalendarRange, P as Compass, _ as Plus, c as Sunrise, m as Search, p as Settings, w as LayoutDashboard, x as MessageSquareText, y as Network } from "../_libs/lucide-react.mjs";
import { n as toast } from "../_libs/sonner.mjs";
import { a as useCurrentUserState } from "./router-JzWW0JG9.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/createSsrRpc-B8lW_4O7.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var listeners = /* @__PURE__ */ new Set();
var pending = null;
function offerImport(items) {
	const usable = items.filter((item) => item.body || item.mediaUrl || item.sourceUrl || item.warning);
	if (!usable.length) return;
	if (listeners.size) {
		listeners.forEach((listener) => listener(usable));
		return;
	}
	pending = usable;
}
function subscribeImport(listener) {
	listeners.add(listener);
	if (pending) {
		const items = pending;
		pending = null;
		listener(items);
	}
	return () => {
		listeners.delete(listener);
	};
}
function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
var MAX_TEXT_CHARS = 4e5;
var MAX_MEDIA_BYTES = 6e6;
var TEXT_EXT = /\.(txt|md|markdown|mdx|csv|tsv|json|html?|xml|ya?ml|log|rtf|tex|srt|vtt|opml|org|rst|ini|conf|cfg)$/i;
var TEXT_MIME = /^(text\/|application\/(json|xml|javascript|x-javascript|yaml|x-yaml|rtf|sql|x-sql))/i;
function wordCount(text) {
	const parts = text.trim().match(/\S+/g);
	return parts ? parts.length : 0;
}
function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1048576) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
	return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}
function formatTextStat(text) {
	const words = wordCount(text);
	const chars = text.length;
	if (!chars) return "";
	return `${words.toLocaleString()} word${words === 1 ? "" : "s"} · ${chars.toLocaleString()} characters`;
}
function looksLikeUrl(value) {
	return /^https?:\/\/\S+$/i.test(value.trim());
}
function htmlToText(html) {
	return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&/gi, "&").replace(/</gi, "<").replace(/>/gi, ">").replace(/"/gi, "\"").replace(/&#39;/gi, "'").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
function titleFromFilename(name) {
	const stem = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
	if (!stem) return "Imported file";
	return stem.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
function titleFromBody(body) {
	const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	const heading = lines.find((l) => /^#{1,6}\s+\S/.test(l));
	if (heading) return heading.replace(/^#{1,6}\s+/, "").slice(0, 80);
	const first = lines[0] ?? "";
	if (first.length && first.length <= 80 && !first.endsWith(".")) return first;
	const sentence = body.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)[0] ?? "";
	if (sentence.length <= 72) return sentence.replace(/[.]+$/, "") || "Imported note";
	return `${sentence.slice(0, 69).trim()}…`;
}
function isTextFile(file) {
	if (file.type.startsWith("image/") || file.type.startsWith("video/") || file.type.startsWith("audio/")) return false;
	if (TEXT_MIME.test(file.type)) return true;
	if (TEXT_EXT.test(file.name)) return true;
	return false;
}
function classifyFile(file) {
	if (file.type.startsWith("image/")) return "photo";
	if (file.type.startsWith("video/")) return "video";
	if (file.type.startsWith("audio/")) return "voice";
	if (isTextFile(file)) return "text";
	return "document";
}
function transferHasFiles(dt) {
	if (!dt) return false;
	if (dt.files && dt.files.length > 0) return true;
	return Array.from(dt.types ?? []).includes("Files");
}
function canDropFiles(dt) {
	return transferHasFiles(dt);
}
function canDropImport(dt) {
	if (!dt) return false;
	if (transferHasFiles(dt)) return true;
	const types = Array.from(dt.types ?? []);
	return types.includes("text/plain") || types.includes("text/uri-list") || types.includes("text/html");
}
function clipText(body, name) {
	if (body.length <= 4e5) return {
		body,
		truncated: false
	};
	return {
		body: body.slice(0, MAX_TEXT_CHARS),
		truncated: true,
		warning: `Kept the first ${MAX_TEXT_CHARS.toLocaleString()} characters${name ? ` of ${name}` : ""}. The rest was too large to store in one node.`
	};
}
function ingestTextBlock(text, sourceName) {
	const trimmed = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	if (looksLikeUrl(trimmed) && trimmed.length < 2048) return {
		kind: "link",
		title: "",
		body: "",
		mediaUrl: null,
		mediaMime: null,
		mediaName: sourceName ?? null,
		sourceUrl: trimmed.trim(),
		truncated: false,
		bytes: trimmed.length
	};
	const clipped = clipText(trimmed, sourceName);
	return {
		kind: "text",
		title: titleFromBody(clipped.body),
		body: clipped.body,
		mediaUrl: null,
		mediaMime: "text/plain",
		mediaName: sourceName ?? null,
		sourceUrl: null,
		truncated: clipped.truncated,
		bytes: trimmed.length,
		warning: clipped.warning
	};
}
async function ingestFile(file) {
	const kind = classifyFile(file);
	const title = titleFromFilename(file.name);
	if (kind === "text") {
		const raw = (await file.text()).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
		const clipped = clipText(/\.(html?|xml)$/i.test(file.name) || /html|xml/.test(file.type) ? htmlToText(raw) : raw, file.name);
		return {
			kind: "text",
			title: titleFromBody(clipped.body) === "Imported note" ? title : titleFromBody(clipped.body) || title,
			body: clipped.body,
			mediaUrl: null,
			mediaMime: file.type || "text/plain",
			mediaName: file.name,
			sourceUrl: null,
			truncated: clipped.truncated,
			bytes: file.size,
			warning: clipped.warning
		};
	}
	if (file.size > 6e6) return {
		kind,
		title,
		body: "",
		mediaUrl: null,
		mediaMime: file.type || null,
		mediaName: file.name,
		sourceUrl: null,
		truncated: false,
		bytes: file.size,
		warning: `${file.name} is ${formatBytes(file.size)}. Keep media under ${formatBytes(MAX_MEDIA_BYTES)}, or paste the text instead.`
	};
	return {
		kind,
		title,
		body: "",
		mediaUrl: await blobToDataUrl(file),
		mediaMime: file.type || null,
		mediaName: file.name,
		sourceUrl: null,
		truncated: false,
		bytes: file.size
	};
}
async function ingestFiles(files) {
	const list = Array.from(files);
	const out = [];
	for (const file of list) out.push(await ingestFile(file));
	return out;
}
function filesFromClipboardItems(items) {
	if (!items) return [];
	const files = [];
	for (const item of Array.from(items)) {
		if (item.kind !== "file") continue;
		const file = item.getAsFile();
		if (file) files.push(file);
	}
	return files;
}
async function ingestDataTransfer(dt) {
	const listed = Array.from(dt.files ?? []);
	const fromItems = filesFromClipboardItems(dt.items);
	const files = listed.length ? listed : fromItems;
	if (files.length) return ingestFiles(files);
	const uriList = dt.getData("text/uri-list");
	const plain = dt.getData("text/plain");
	const html = dt.getData("text/html");
	const uri = uriList.split("\n").map((s) => s.trim()).find((s) => s && !s.startsWith("#"));
	if (uri && looksLikeUrl(uri)) return [ingestTextBlock(uri)];
	const text = plain.trim() ? plain : html ? htmlToText(html) : "";
	if (text.trim()) return [ingestTextBlock(text)];
	return [];
}
async function ingestClipboardEvent(event) {
	const dt = event.clipboardData;
	if (!dt) return [];
	const files = Array.from(dt.files ?? []).length ? Array.from(dt.files) : filesFromClipboardItems(dt.items);
	const plain = dt.getData("text/plain");
	const html = dt.getData("text/html");
	const text = plain.trim() ? plain : html ? htmlToText(html) : "";
	const items = [];
	if (files.length) items.push(...await ingestFiles(files));
	if (text.trim() && !looksLikeUrl(text.trim()) && files.every((f) => !f.type.startsWith("text/"))) {
		if (!(files.length && text.trim().length < 80)) items.push(ingestTextBlock(text));
	} else if (text.trim() && !files.length) items.push(ingestTextBlock(text));
	return items;
}
async function readSystemClipboard() {
	const nav = navigator.clipboard;
	if (nav && "read" in nav && typeof nav.read === "function") try {
		const clipboardItems = await nav.read();
		const files = [];
		let text = "";
		for (const item of clipboardItems) {
			const types = item.types ?? [];
			if (types.includes("text/plain")) {
				const blob = await item.getType("text/plain");
				text += await blob.text();
			} else {
				const imageType = types.find((t) => t.startsWith("image/"));
				const textType = types.find((t) => t.startsWith("text/"));
				const type = imageType ?? textType;
				if (!type) continue;
				const blob = await item.getType(type);
				const ext = type.split("/")[1]?.split("+")[0] || "bin";
				files.push(new File([blob], `clipboard.${ext}`, { type }));
			}
		}
		const items = [];
		if (files.length) items.push(...await ingestFiles(files));
		if (text.trim()) items.push(ingestTextBlock(text));
		if (items.length) return items;
	} catch {}
	if (nav && typeof nav.readText === "function") {
		const text = await nav.readText();
		if (text.trim()) return [ingestTextBlock(text)];
	}
	return [];
}
async function pickFilesFromDevice() {
	const w = window;
	if (typeof w.showOpenFilePicker !== "function") return "fallback";
	try {
		const handles = await w.showOpenFilePicker({ multiple: true });
		return await Promise.all(handles.map((h) => h.getFile()));
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
		return "fallback";
	}
}
function ImportDropHost({ disabled = false }) {
	const navigate = useNavigate();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const [active, setActive] = (0, import_react.useState)(false);
	const depth = (0, import_react.useRef)(0);
	(0, import_react.useEffect)(() => {
		if (disabled) return;
		function hide() {
			depth.current = 0;
			setActive(false);
		}
		function onEnter(e) {
			if (!canDropFiles(e.dataTransfer)) return;
			depth.current += 1;
			setActive(true);
		}
		function onOver(e) {
			if (!canDropFiles(e.dataTransfer)) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		}
		function onLeave() {
			depth.current = Math.max(0, depth.current - 1);
			if (depth.current === 0) setActive(false);
		}
		async function onDrop(e) {
			if (!canDropFiles(e.dataTransfer)) {
				hide();
				return;
			}
			e.preventDefault();
			hide();
			const dt = e.dataTransfer;
			if (!dt) return;
			try {
				const items = await ingestDataTransfer(dt);
				if (!items.length) {
					toast.error("Nothing usable in that drop.");
					return;
				}
				offerImport(items);
				if (pathname !== "/capture") navigate({ to: "/capture" });
			} catch {
				toast.error("Couldn’t read that drop.");
			}
		}
		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragover", onOver);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("drop", onDrop);
		window.addEventListener("dragend", hide);
		return () => {
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("drop", onDrop);
			window.removeEventListener("dragend", hide);
		};
	}, [
		disabled,
		navigate,
		pathname
	]);
	if (disabled || !active) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "rounded-2xl border border-primary bg-card px-8 py-6 text-center shadow-soft",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-2xl",
				children: "Drop into your mesh"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted-foreground",
				children: "Files, photos, or notes from any app — they’ll open in Capture."
			})]
		})
	});
}
var NAV = [
	{
		to: "/",
		label: "Mesh",
		icon: Network,
		exact: true
	},
	{
		to: "/capture",
		label: "Capture",
		icon: Plus
	},
	{
		to: "/dashboard",
		label: "Dashboard",
		icon: LayoutDashboard
	},
	{
		to: "/timeline",
		label: "Timeline",
		icon: CalendarRange
	},
	{
		to: "/search",
		label: "Search",
		icon: Search
	},
	{
		to: "/assistant",
		label: "Assistant",
		icon: MessageSquareText
	},
	{
		to: "/reflect",
		label: "Reflect",
		icon: Sunrise
	}
];
function AppShell({ children, bleed = false, locked = false }) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { user, isPending } = useCurrentUserState();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mesh-field relative min-h-dvh",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dot-grid pointer-events-none absolute inset-0 opacity-70" }),
			!locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center border-r border-border bg-background/80 py-4 backdrop-blur-md md:flex",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/",
						className: "mb-6 flex size-10 items-center justify-center",
						"aria-label": "MindMesh",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "relative flex size-8 items-center justify-center",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "absolute inset-0 rounded-full bg-highlight/30 animate-pulse-ring" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "relative size-3.5 rounded-full bg-highlight shadow-[0_0_16px_var(--color-highlight)]" })]
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "flex flex-1 flex-col items-center gap-1",
						children: NAV.map((item) => {
							const active = pathname === item.to || ("exact" in item && item.exact ? false : pathname.startsWith(item.to) && item.to !== "/");
							const Icon = item.icon;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: item.to,
								title: item.label,
								className: cn("flex size-11 items-center justify-center rounded-md transition-colors", active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-5" })
							}, item.to);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-auto flex flex-col items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
							to: "/settings",
							title: "Settings",
							className: cn("flex size-11 items-center justify-center rounded-md", pathname.startsWith("/settings") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, { className: "size-5" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "flex size-11 items-center justify-center",
							children: isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "size-8 animate-pulse rounded-full bg-secondary" }) : user ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
								to: "/settings",
								className: "grid size-8 place-items-center rounded-full bg-secondary text-xs font-medium text-primary",
								title: "Account",
								children: (user.displayName ?? user.primaryEmail ?? "ME").charAt(0).toUpperCase()
							}) : null
						})]
					})
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
				className: cn("relative z-10 min-h-dvh", locked ? "pb-0 md:pl-0" : "pb-20 md:pb-0 md:pl-16", !bleed && "px-4 py-5 sm:px-6 lg:px-8"),
				children
			}),
			!locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-border bg-background/90 px-1 py-1.5 backdrop-blur-md md:hidden",
				children: [
					NAV[0],
					NAV[2],
					NAV[1],
					NAV[4],
					NAV[5],
					{
						to: "/settings",
						label: "More",
						icon: Compass
					}
				].map((item) => {
					const active = "exact" in item && item.exact ? pathname === "/" : pathname.startsWith(item.to);
					const Icon = item.icon;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: item.to,
						className: cn("flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 rounded-md px-2 text-[10px]", active ? "text-primary" : "text-muted-foreground"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-5" }), item.label]
					}, item.to);
				})
			}) : null,
			!locked ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImportDropHost, {}) : null
		]
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
//#endregion
export { formatTextStat as a, ingestFiles as c, readSystemClipboard as d, subscribeImport as f, formatBytes as i, ingestTextBlock as l, canDropImport as n, ingestClipboardEvent as o, createSsrRpc as r, ingestDataTransfer as s, AppShell as t, pickFilesFromDevice as u };
