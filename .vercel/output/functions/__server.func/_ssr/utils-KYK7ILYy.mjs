import { n as clsx } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/utils-KYK7ILYy.js
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function newId() {
	return crypto.randomUUID();
}
function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}
function formatRelative(iso) {
	const date = new Date(iso);
	const diff = Date.now() - date.getTime();
	const minutes = Math.round(diff / 6e4);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 14) return `${days}d ago`;
	return date.toLocaleDateString(void 0, {
		month: "short",
		day: "numeric",
		year: date.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() ? void 0 : "numeric"
	});
}
function formatDate(iso) {
	return new Date(iso).toLocaleDateString(void 0, {
		weekday: "short",
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}
//#endregion
export { newId as a, formatRelative as i, cn as n, formatDate as r, blobToDataUrl as t };
