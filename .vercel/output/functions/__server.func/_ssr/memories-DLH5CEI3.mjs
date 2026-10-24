import { r as createServerFn } from "./ssr.mjs";
import { t as authMiddleware } from "./middleware-CHZF_giW.mjs";
import { r as createSsrRpc } from "./createSsrRpc-B8lW_4O7.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/memories-DLH5CEI3.js
var listMemories = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("9d81d9bd0ad39b99a3d34c5266f241952535a8c27bc38e0cf03a7e57be7229d7"));
var getMemory = createServerFn({ method: "GET" }).validator((id) => id).middleware([authMiddleware]).handler(createSsrRpc("eb9ccf3e36cea7b190f445f3c798a8a53c326e5883f16b86bbcdb294ee8da02d"));
var createMemory = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("24a5caf39a163d5e0926cb16f4567c9f3542c35b744f8a3fb439c11bcbb68b2f"));
var updateMemory = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("eeb10904534d0fcee5512db4e052eeb18ebfb7c1f992010d8046c3c33b8d3af0"));
var deleteMemory = createServerFn({ method: "POST" }).validator((id) => id).middleware([authMiddleware]).handler(createSsrRpc("006d71105145a155a7ffd05e3ad9eadd5865261650335520859d4878843d93e1"));
var savePositions = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("5af16bfb1430ba7c2ebe9852d128489e913f1b6b1f2696a86be02a5e9e0c5d81"));
var setConnectionStatus = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("b7f8181e42b45ad75479b3853d74165c0468f2d24659b5267af6d5e0d3ac99b4"));
var getGraph = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("05f45d36d79575950b4c83607f4d66c101b825c38d7f8a9929af66e03680e105"));
var suggestMemoryTags = createServerFn({ method: "POST" }).validator((input) => input).middleware([authMiddleware]).handler(createSsrRpc("28f4e40a9e9eb1b3fa5b8e5eeeed63af4660dd66a4950a18ea09dd4820c318a2"));
//#endregion
export { listMemories as a, suggestMemoryTags as c, getMemory as i, updateMemory as l, deleteMemory as n, savePositions as o, getGraph as r, setConnectionStatus as s, createMemory as t };
