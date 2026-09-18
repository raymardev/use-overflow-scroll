// La extensión .js es obligatoria: en ESM real los especificadores relativos no
// se resuelven sin ella, y TypeScript no los reescribe al emitir. Apunta al .ts
// en tiempo de compilación y al .js emitido en tiempo de ejecución.
export {
	default,
	default as useOverflowScroll,
	DEFAULT_IGNORE_SELECTOR,
} from "./hooks/useOverflowScroll.js";
export type {
	OverflowScrollAxis,
	UseOverflowScrollOptions,
	UseOverflowScrollResult,
} from "./hooks/useOverflowScroll.js";
