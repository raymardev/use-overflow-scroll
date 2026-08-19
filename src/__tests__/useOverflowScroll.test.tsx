import { render, fireEvent, cleanup } from "@testing-library/react";
import { OverflowedComponent } from "./mocks/OverflowedComponent";
import { resizeObservers } from "../../jest.setup";

/**
 * jsdom no hace layout: scrollWidth/clientWidth y compañía valen siempre 0, así
 * que el hook nunca vería desbordamiento. Estos spies sobre HTMLElement.prototype
 * se instalan ANTES de render(), porque la medición ocurre en el efecto de montaje.
 */
function fakeSize(client: number, scroll: number): void {
	jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(client);
	jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(client);
	jest.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scroll);
	jest.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scroll);
}

/** Desbordamiento solo en el eje horizontal. */
function fakeSizeXOnly(): void {
	jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
	jest.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(300);
	jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
	jest.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100);
}

const OVERFLOWING = { client: 100, scroll: 300 };

function down(el: Element, x: number, y: number, init: object = {}) {
	fireEvent.pointerDown(el, {
		pointerId: 1,
		pointerType: "mouse",
		isPrimary: true,
		button: 0,
		clientX: x,
		clientY: y,
		...init,
	});
}

function move(el: Element, x: number, y: number) {
	fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y });
}

function up(el: Element, x: number, y: number) {
	fireEvent.pointerUp(el, { pointerId: 1, clientX: x, clientY: y });
}

afterEach(() => {
	cleanup();
	jest.restoreAllMocks();
});

describe("useOverflowScroll · detección de desbordamiento", () => {
	it("A1 · marca el contenedor como desbordado y ofrece cursor grab", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		expect(el.dataset.overflowing).toBe("true");
		expect(el.style.cursor).toBe("grab");
		expect(el.style.overflow).toBe("auto");
	});

	it("A2 · sin desbordamiento no marca nada ni escribe overflow", () => {
		fakeSize(300, 300);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		expect(el.dataset.overflowing).toBe("false");
		expect(el.style.cursor).toBe("");
		// Regresión de C1: la 1.0.x escribía `overflow: visible` y machacaba el CSS.
		expect(el.style.overflow).toBe("");
	});

	it("A3 · desbordamiento solo en X sigue permitiendo arrastrar", () => {
		fakeSizeXOnly();
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");
		expect(el.dataset.overflowing).toBe("true");

		el.scrollLeft = 100;
		el.scrollTop = 100;
		down(el, 100, 100);
		move(el, 60, 100); // cruza el umbral y reancla
		move(el, 40, 80);

		expect(el.scrollLeft).toBe(120);
		expect(el.scrollTop).toBe(100); // el eje Y no desborda: no se toca
	});
});

describe("useOverflowScroll · arrastre", () => {
	it("B1 · desplaza el scroll según el delta absoluto del puntero", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;
		el.scrollTop = 100;

		down(el, 100, 100);
		// Este movimiento cruza el umbral y reancla, así que no debe desplazar.
		move(el, 60, 80);
		expect(el.scrollLeft).toBe(100);
		expect(el.scrollTop).toBe(100);

		// A partir del ancla, el contenido sigue al puntero 1:1.
		move(el, 40, 60);
		expect(el.scrollLeft).toBe(120);
		expect(el.scrollTop).toBe(120);
	});

	it("B2 · por debajo del umbral no se considera arrastre", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;
		down(el, 100, 100);
		move(el, 97, 98); // max(3, 2) < 5

		expect(el.scrollLeft).toBe(100);
		expect(el.dataset.dragging).toBeUndefined();
		expect(el.style.cursor).toBe("grab");
	});

	it("B3 · el scroll invierte al invertir la dirección del gesto", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;
		down(el, 100, 100);
		move(el, 90, 100); // ancla
		move(el, 70, 100);
		expect(el.scrollLeft).toBe(120);

		move(el, 110, 100);
		expect(el.scrollLeft).toBe(80);
	});

	it("B4 · un pointermove sin pointerdown previo no hace nada", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;
		move(el, 40, 60);

		expect(el.scrollLeft).toBe(100);
		expect(el.dataset.dragging).toBeUndefined();
	});

	it("B5 · marca data-dragging y cursor grabbing solo durante el arrastre", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		down(el, 100, 100);
		expect(el.dataset.dragging).toBeUndefined(); // aún no cruzó el umbral

		move(el, 80, 100);
		expect(el.dataset.dragging).toBe("true");
		expect(el.style.cursor).toBe("grabbing");
		expect(el.style.getPropertyValue("user-select")).toBe("none");

		up(el, 80, 100);
		expect(el.dataset.dragging).toBeUndefined();
		expect(el.style.cursor).toBe("grab");
		expect(el.style.getPropertyValue("user-select")).toBe("");
	});
});

describe("useOverflowScroll · convivencia con contenido interactivo", () => {
	it("C1 · un arrastre real no activa el enlace que hay debajo", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const onLinkClick = jest.fn();
		const { getByTestId } = render(
			<OverflowedComponent onLinkClick={onLinkClick} />
		);
		const el = getByTestId("overflowed-div");
		const link = getByTestId("child-link");

		down(link, 100, 100);
		move(el, 60, 100);
		up(el, 60, 100);
		fireEvent.click(link);

		expect(onLinkClick).not.toHaveBeenCalled();
	});

	it("C2 · un click sin arrastre sí activa el enlace", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const onLinkClick = jest.fn();
		const { getByTestId } = render(
			<OverflowedComponent onLinkClick={onLinkClick} />
		);
		const el = getByTestId("overflowed-div");
		const link = getByTestId("child-link");

		down(link, 100, 100);
		move(el, 102, 101); // por debajo del umbral
		up(el, 102, 101);
		fireEvent.click(link);

		expect(onLinkClick).toHaveBeenCalledTimes(1);
	});

	it("C3 · pulsar sobre un input no inicia arrastre y respeta el foco", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");
		const input = getByTestId("child-input");

		el.scrollLeft = 100;
		down(input, 100, 100);
		move(el, 40, 60);

		expect(el.scrollLeft).toBe(100);
		expect(el.dataset.dragging).toBeUndefined();
	});

	it("C4 · el pointerdown de un arrastre no cancela la acción por defecto", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		// Regresión de C3: la 1.0.x hacía preventDefault() incondicional, lo que
		// impedía que un control anidado recibiera el foco.
		const event = new window.PointerEvent("pointerdown", {
			pointerId: 1,
			bubbles: true,
			cancelable: true,
			clientX: 100,
			clientY: 100,
		});
		el.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(false);
	});
});

describe("useOverflowScroll · robustez del gesto", () => {
	it("D1 · ignora el botón secundario y el táctil", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;

		down(el, 100, 100, { button: 2 });
		move(el, 40, 60);
		expect(el.scrollLeft).toBe(100);
		expect(el.style.cursor).toBe("grab");

		down(el, 100, 100, { pointerType: "touch" });
		move(el, 40, 60);
		expect(el.scrollLeft).toBe(100);
		expect(el.dataset.dragging).toBeUndefined();
	});

	it("D2 · pointercancel termina el arrastre y restaura los estilos", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		down(el, 100, 100);
		move(el, 80, 100);
		expect(el.dataset.dragging).toBe("true");

		fireEvent.pointerCancel(el, { pointerId: 1 });

		expect(el.dataset.dragging).toBeUndefined();
		expect(el.style.getPropertyValue("user-select")).toBe("");
		expect(el.style.cursor).toBe("grab");
	});

	it("D3 · desmontar a mitad de arrastre limpia todo lo que el hook escribió", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId, unmount } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		down(el, 100, 100);
		move(el, 80, 100);
		expect(el.dataset.dragging).toBe("true");

		unmount();

		expect(el.dataset.dragging).toBeUndefined();
		expect(el.dataset.overflowing).toBeUndefined();
		expect(el.style.cursor).toBe("");
		expect(el.style.overflow).toBe("");
		expect(el.style.getPropertyValue("user-select")).toBe("");
	});
});

describe("useOverflowScroll · cambios de tamaño y casos límite", () => {
	it("E1 · re-mide cuando el contenido pasa a desbordar", () => {
		fakeSize(300, 300); // arranca sin desbordamiento
		const { getByTestId } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");
		expect(el.dataset.overflowing).toBe("false");

		// Llegan datos y el contenido crece.
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		resizeObservers.forEach((observer) => observer.trigger());

		// Regresión de C1: la 1.0.x medía una sola vez en el montaje.
		expect(el.dataset.overflowing).toBe("true");
		expect(el.style.cursor).toBe("grab");
	});

	it("E2 · no lanza si el componente nunca adjunta el ref", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		expect(() =>
			render(<OverflowedComponent attachRef={false} />)
		).not.toThrow();
	});

	it("E3 · no deja listeners de puntero vivos tras desmontar", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId, unmount } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");

		const removed = jest.spyOn(el, "removeEventListener");
		unmount();

		const removedTypes = removed.mock.calls.map((call) => call[0]);
		expect(removedTypes).toContain("pointerdown");
		expect(removedTypes).toContain("click");
	});
});
