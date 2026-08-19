import { render, fireEvent, cleanup } from "@testing-library/react";
import { createRef } from "react";
import {
	LateMountedComponent,
	ListComponent,
	OverflowedComponent,
} from "./mocks/OverflowedComponent";
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

	it("E3 · un contenedor montado en un render posterior sí se engancha", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<LateMountedComponent />);

		fireEvent.click(getByTestId("show"));
		const el = getByTestId("overflowed-div");

		// El callback ref sigue al nodo; con el useEffect+[] de la 1.x esto fallaba.
		expect(el.dataset.overflowing).toBe("true");

		el.scrollLeft = 100;
		down(el, 100, 100);
		move(el, 80, 100);
		move(el, 60, 100);
		expect(el.scrollLeft).toBe(120);
	});

	it("E4 · no deja listeners de puntero vivos tras desmontar", () => {
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

describe("useOverflowScroll · opciones", () => {
	it("F1 · disabled impide el arrastre y no marca desbordamiento", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent disabled />);
		const el = getByTestId("overflowed-div");

		expect(el.dataset.overflowing).toBe("false");
		el.scrollLeft = 100;
		down(el, 100, 100);
		move(el, 40, 60);
		expect(el.scrollLeft).toBe(100);
	});

	it("F2 · axis limita el eje que se desplaza", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent axis="x" />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;
		el.scrollTop = 100;
		down(el, 100, 100);
		move(el, 80, 80);
		move(el, 60, 60);

		expect(el.scrollLeft).toBe(120);
		expect(el.scrollTop).toBe(100);
		// Con axis "x" el overflow se escribe solo en ese eje.
		expect(el.style.getPropertyValue("overflow-x")).toBe("auto");
		expect(el.style.getPropertyValue("overflow")).toBe("");
	});

	it("F3 · multiplier escala el desplazamiento", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent multiplier={2} />);
		const el = getByTestId("overflowed-div");

		el.scrollLeft = 100;
		down(el, 100, 100);
		move(el, 80, 100);
		move(el, 60, 100);

		expect(el.scrollLeft).toBe(140); // 20px de puntero -> 40px de scroll
	});

	it("F4 · dragThreshold desplaza el punto de activación", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(<OverflowedComponent dragThreshold={40} />);
		const el = getByTestId("overflowed-div");

		down(el, 100, 100);
		move(el, 80, 100); // 20px: por debajo de 40
		expect(el.dataset.dragging).toBeUndefined();

		move(el, 40, 100); // 60px: lo supera
		expect(el.dataset.dragging).toBe("true");
	});

	it("F5 · manageOverflow y manageCursor en false no tocan el estilo", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(
			<OverflowedComponent manageOverflow={false} manageCursor={false} />
		);
		const el = getByTestId("overflowed-div");

		expect(el.style.overflow).toBe("");
		expect(el.style.cursor).toBe("");
		// Pero el arrastre sigue activo y el estado sigue expuesto para el CSS.
		expect(el.dataset.overflowing).toBe("true");
		el.scrollLeft = 100;
		down(el, 100, 100);
		move(el, 80, 100);
		move(el, 60, 100);
		expect(el.scrollLeft).toBe(120);
	});

	it("F6 · ignoreSelector personalizado sustituye al de por defecto", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId } = render(
			<OverflowedComponent ignoreSelector="[data-testid='child-text']" />
		);
		const el = getByTestId("overflowed-div");

		// El texto pasa a estar excluido...
		el.scrollLeft = 100;
		down(getByTestId("child-text"), 100, 100);
		move(el, 60, 100);
		expect(el.scrollLeft).toBe(100);

		// ...y el input, que ya no lo está, sí arrastra.
		down(getByTestId("child-input"), 100, 100);
		move(el, 80, 100);
		move(el, 60, 100);
		expect(el.scrollLeft).toBe(120);
	});

	it("F7 · onDragStart y onDragEnd solo se disparan en arrastres reales", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const onDragStart = jest.fn();
		const onDragEnd = jest.fn();
		const { getByTestId } = render(
			<OverflowedComponent onDragStart={onDragStart} onDragEnd={onDragEnd} />
		);
		const el = getByTestId("overflowed-div");

		// Gesto por debajo del umbral: no cuenta.
		down(el, 100, 100);
		move(el, 98, 100);
		up(el, 98, 100);
		expect(onDragStart).not.toHaveBeenCalled();
		expect(onDragEnd).not.toHaveBeenCalled();

		down(el, 100, 100);
		move(el, 60, 100);
		up(el, 60, 100);
		expect(onDragStart).toHaveBeenCalledTimes(1);
		expect(onDragEnd).toHaveBeenCalledTimes(1);
	});

	it("F8 · acepta una ref externa y un elemento que no es div", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const externalRef = createRef<HTMLUListElement>() as React.MutableRefObject<HTMLUListElement | null>;
		const { getByTestId } = render(<ListComponent externalRef={externalRef} />);
		const el = getByTestId("list");

		expect(externalRef.current).toBe(el);
		expect(el.dataset.overflowing).toBe("true");
	});

	it("F9 · cambiar disabled en caliente re-mide sin reinstalar", () => {
		fakeSize(OVERFLOWING.client, OVERFLOWING.scroll);
		const { getByTestId, rerender } = render(<OverflowedComponent />);
		const el = getByTestId("overflowed-div");
		expect(el.dataset.overflowing).toBe("true");

		rerender(<OverflowedComponent disabled />);
		expect(el.dataset.overflowing).toBe("false");

		rerender(<OverflowedComponent />);
		expect(el.dataset.overflowing).toBe("true");
	});
});
