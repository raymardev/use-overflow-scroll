import { useEffect, useLayoutEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";

/**
 * Ref que devuelve `useOverflowScroll`. Asígnalo al elemento scrollable.
 * `current` es nulable: es `null` antes del montaje y tras el desmontaje.
 */
export type UseOverflowScroll = RefObject<HTMLDivElement>;

/** Píxeles que debe recorrer el puntero antes de considerarse un arrastre. */
const DRAG_THRESHOLD = 5;

/**
 * Descendientes que no deben iniciar un arrastre.
 *
 * Solo controles de entrada: ahí el gesto del ratón significa colocar el caret o
 * seleccionar texto, y robarlo sería un error. Los enlaces y botones SÍ inician
 * arrastre a propósito — un carrusel suele estar hecho de tarjetas enlazadas, y
 * excluirlos lo dejaría inservible. A esos los protege la supresión del `click`
 * posterior a un arrastre real.
 */
const IGNORE_SELECTOR =
	"input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-no-drag]";

/** Propiedades inline que el hook escribe y debe restaurar al limpiar. */
const MANAGED_STYLE_PROPS = [
	"cursor",
	"overflow",
	"user-select",
	"-webkit-user-select",
];

/** `useLayoutEffect` en cliente, `useEffect` en servidor: evita el warning de SSR. */
const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface DragSession {
	pointerId: number;
	/** Origen del gesto, para evaluar el umbral. */
	originX: number;
	originY: number;
	/** Ancla reajustada al cruzar el umbral, para que no haya salto inicial. */
	anchorX: number;
	anchorY: number;
	anchorScrollLeft: number;
	anchorScrollTop: number;
	/** `true` una vez superado `DRAG_THRESHOLD`. */
	active: boolean;
}

/**
 * Instala el comportamiento sobre un nodo concreto y devuelve su limpieza.
 *
 * Vive fuera del hook a propósito: recibir `node` ya no nulo por firma evita
 * depender del estrechamiento de tipos dentro de funciones elevadas (hoisted).
 *
 * @param node - Contenedor scrollable.
 * @param isDragging - Ref compartida con el hook; `true` durante un arrastre real.
 * @returns Función que revierte todo lo instalado.
 */
function install(
	node: HTMLDivElement,
	isDragging: MutableRefObject<boolean>
): () => void {
	const view = node.ownerDocument.defaultView;

	// Instantánea de los estilos inline previos, para restaurarlos al limpiar.
	const styleSnapshot: Record<string, string> = {};
	MANAGED_STYLE_PROPS.forEach((prop) => {
		styleSnapshot[prop] = node.style.getPropertyValue(prop);
	});

	let session: DragSession | null = null;
	let suppressClick = false;
	let overflowX = false;
	let overflowY = false;
	let draggable = false;
	let resizeObserver: ResizeObserver | null = null;
	let mutationObserver: MutationObserver | null = null;

	function restoreStyle(prop: string): void {
		const previous = styleSnapshot[prop];
		if (previous) node.style.setProperty(prop, previous);
		else node.style.removeProperty(prop);
	}

	function measure(): void {
		overflowX = node.scrollWidth > node.clientWidth;
		overflowY = node.scrollHeight > node.clientHeight;
		draggable = overflowX || overflowY;

		node.dataset.overflowing = draggable ? "true" : "false";

		// Solo se escribe `auto` cuando hay desbordamiento. Nunca se escribe
		// `visible`: eso machacaba el CSS del consumidor (incluido un
		// `overflow: hidden` deliberado) y dejaba el contenido fuera de la caja.
		if (draggable) node.style.setProperty("overflow", "auto");
		else restoreStyle("overflow");

		if (!isDragging.current) {
			if (draggable) node.style.setProperty("cursor", "grab");
			else restoreStyle("cursor");
		}
	}

	function endSession(pointerId: number): void {
		session = null;
		isDragging.current = false;

		node.removeEventListener("pointermove", handlePointerMove);
		node.removeEventListener("pointerup", handlePointerEnd);
		node.removeEventListener("pointercancel", handlePointerEnd);
		node.removeEventListener("lostpointercapture", handlePointerEnd);

		if (node.hasPointerCapture?.(pointerId)) {
			try {
				node.releasePointerCapture(pointerId);
			} catch {
				// El puntero ya no existe; no hay nada que liberar.
			}
		}

		delete node.dataset.dragging;
		restoreStyle("user-select");
		restoreStyle("-webkit-user-select");
		measure();
	}

	function handlePointerDown(event: PointerEvent): void {
		suppressClick = false;

		if (!draggable) return;
		if (!event.isPrimary || event.button !== 0) return;
		// Ctrl+click en macOS abre el menú contextual: no es un arrastre.
		if (event.ctrlKey) return;
		// El táctil se deja al scroll nativo, que ya trae inercia del sistema.
		if (event.pointerType === "touch") return;

		const target = event.target;
		if (target instanceof Element && target.closest(IGNORE_SELECTOR)) return;

		session = {
			pointerId: event.pointerId,
			originX: event.clientX,
			originY: event.clientY,
			anchorX: event.clientX,
			anchorY: event.clientY,
			anchorScrollLeft: node.scrollLeft,
			anchorScrollTop: node.scrollTop,
			active: false,
		};

		try {
			node.setPointerCapture?.(event.pointerId);
		} catch {
			// Sin captura seguimos funcionando mientras el puntero esté encima.
		}

		node.addEventListener("pointermove", handlePointerMove);
		node.addEventListener("pointerup", handlePointerEnd);
		node.addEventListener("pointercancel", handlePointerEnd);
		node.addEventListener("lostpointercapture", handlePointerEnd);
		// Sin preventDefault aquí: el foco y el caret deben seguir funcionando.
	}

	function handlePointerMove(event: PointerEvent): void {
		const current = session;
		if (!current || event.pointerId !== current.pointerId) return;

		if (!current.active) {
			const dx = Math.abs(event.clientX - current.originX);
			const dy = Math.abs(event.clientY - current.originY);
			if (Math.max(dx, dy) < DRAG_THRESHOLD) return;

			// Reancla en el punto de activación para que no haya salto.
			current.active = true;
			current.anchorX = event.clientX;
			current.anchorY = event.clientY;
			current.anchorScrollLeft = node.scrollLeft;
			current.anchorScrollTop = node.scrollTop;

			isDragging.current = true;
			node.dataset.dragging = "true";
			node.style.setProperty("user-select", "none");
			node.style.setProperty("-webkit-user-select", "none");
			node.style.setProperty("cursor", "grabbing");
			view?.getSelection()?.removeAllRanges();
		}

		event.preventDefault();

		// Delta absoluto sobre clientX/clientY, no movementX/movementY: aquel
		// deriva de screenX y se descuadra con zoom de página o escalado del SO.
		if (overflowX) {
			node.scrollLeft =
				current.anchorScrollLeft - (event.clientX - current.anchorX);
		}
		if (overflowY) {
			node.scrollTop =
				current.anchorScrollTop - (event.clientY - current.anchorY);
		}
	}

	function handlePointerEnd(event: PointerEvent): void {
		const current = session;
		if (!current || event.pointerId !== current.pointerId) return;

		const wasActive = current.active;
		endSession(event.pointerId);
		// Un arrastre real no debe activar el enlace o botón bajo el cursor.
		if (wasActive) suppressClick = true;
	}

	function handleClickCapture(event: MouseEvent): void {
		if (!suppressClick) return;
		suppressClick = false;
		event.stopPropagation();
		event.preventDefault();
	}

	function handleWindowBlur(): void {
		const current = session;
		if (!current) return;
		const wasActive = current.active;
		endSession(current.pointerId);
		if (wasActive) suppressClick = true;
	}

	/** Observa el contenedor y sus hijos directos (capta carga de imágenes). */
	function observeChildren(): void {
		if (!resizeObserver) return;
		resizeObserver.disconnect();
		resizeObserver.observe(node);
		for (let i = 0; i < node.children.length; i += 1) {
			const child = node.children.item(i);
			if (child) resizeObserver.observe(child);
		}
	}

	node.addEventListener("pointerdown", handlePointerDown);
	node.addEventListener("click", handleClickCapture, true);
	view?.addEventListener("blur", handleWindowBlur);

	if (typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => measure());
		observeChildren();
	} else {
		// Entornos sin ResizeObserver (jsdom, navegadores antiguos).
		view?.addEventListener("resize", measure);
	}

	if (typeof MutationObserver !== "undefined") {
		mutationObserver = new MutationObserver(() => {
			observeChildren();
			measure();
		});
		mutationObserver.observe(node, {
			childList: true,
			subtree: true,
			characterData: true,
		});
	}

	measure();

	return () => {
		if (session) endSession(session.pointerId);
		node.removeEventListener("pointerdown", handlePointerDown);
		node.removeEventListener("click", handleClickCapture, true);
		view?.removeEventListener("blur", handleWindowBlur);
		view?.removeEventListener("resize", measure);
		resizeObserver?.disconnect();
		mutationObserver?.disconnect();
		MANAGED_STYLE_PROPS.forEach(restoreStyle);
		delete node.dataset.overflowing;
		delete node.dataset.dragging;
	};
}

/**
 * Añade scroll por arrastre ("grab to scroll") a un elemento con desbordamiento.
 *
 * Detecta si el contenido desborda y solo entonces activa el arrastre, poniendo
 * `overflow: auto` y `cursor: grab`. Vuelve a medir ante cambios de tamaño o de
 * contenido, así que funciona con datos que llegan de forma asíncrona.
 *
 * Usa Pointer Events con `setPointerCapture`, por lo que el gesto termina bien
 * aunque el puntero salga de la ventana. Deja el táctil al scroll nativo, aplica
 * un umbral de arrastre para no robar clicks ni el foco de controles anidados,
 * suprime el `click` posterior a un arrastre real y restaura todos los estilos
 * inline que haya escrito.
 *
 * Es seguro en SSR: no accede a `window` ni a `document` durante el render.
 *
 * Expone `data-overflowing` y `data-dragging` en el elemento para que el CSS
 * reaccione al estado sin provocar re-renders.
 *
 * El consumidor sigue siendo responsable de la accesibilidad de teclado: añade
 * `tabIndex={0}` y un `aria-label` al contenedor para que se pueda scrollear
 * sin ratón.
 *
 * @returns Ref a asignar al elemento scrollable.
 *
 * @example
 * ```tsx
 * const ref = useOverflowScroll();
 * return <div ref={ref} className="carrusel">{items}</div>;
 * ```
 */
export default function useOverflowScroll(): UseOverflowScroll {
	const ref = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);

	useIsomorphicLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		return install(node, isDragging);
	}, []);

	return ref;
}
