import "@testing-library/jest-dom";

/*
 * jsdom no implementa PointerEvent, la API de pointer capture ni ResizeObserver.
 * Sin estos stubs el hook no puede probarse: `fireEvent.pointerDown` crearía un
 * Event genérico sin `pointerId`/`clientX`, y `new ResizeObserver()` lanzaría.
 */

if (typeof window.PointerEvent === "undefined") {
	class PointerEventPolyfill extends MouseEvent {
		public readonly pointerId: number;
		public readonly pointerType: string;
		public readonly isPrimary: boolean;

		constructor(type: string, params: PointerEventInit = {}) {
			super(type, params);
			this.pointerId = params.pointerId ?? 1;
			this.pointerType = params.pointerType ?? "mouse";
			this.isPrimary = params.isPrimary ?? true;
		}
	}

	window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
	global.PointerEvent = window.PointerEvent;
}

if (!Element.prototype.setPointerCapture) {
	const captured = new WeakMap<Element, Set<number>>();

	Element.prototype.setPointerCapture = function setPointerCapture(id: number) {
		const ids = captured.get(this) ?? new Set<number>();
		ids.add(id);
		captured.set(this, ids);
	};
	Element.prototype.hasPointerCapture = function hasPointerCapture(id: number) {
		return captured.get(this)?.has(id) ?? false;
	};
	Element.prototype.releasePointerCapture = function releasePointerCapture(
		id: number
	) {
		captured.get(this)?.delete(id);
	};
}

/**
 * ResizeObserver controlable: las instancias vivas se exponen para que un test
 * pueda disparar la re-medición manualmente (jsdom nunca hace layout).
 */
export const resizeObservers: MockResizeObserver[] = [];

export class MockResizeObserver implements ResizeObserver {
	public readonly targets = new Set<Element>();

	constructor(private readonly callback: ResizeObserverCallback) {
		resizeObservers.push(this);
	}

	observe(target: Element): void {
		this.targets.add(target);
	}
	unobserve(target: Element): void {
		this.targets.delete(target);
	}
	disconnect(): void {
		this.targets.clear();
	}

	/** Dispara el callback como si el navegador hubiera detectado un resize. */
	trigger(): void {
		this.callback([], this);
	}
}

if (typeof window.ResizeObserver === "undefined") {
	window.ResizeObserver = MockResizeObserver;
	global.ResizeObserver = MockResizeObserver;
}

beforeEach(() => {
	resizeObservers.length = 0;
});
