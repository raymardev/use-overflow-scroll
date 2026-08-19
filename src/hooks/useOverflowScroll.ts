import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { MutableRefObject, RefCallback } from "react";

/** Ejes sobre los que se permite arrastrar. */
export type OverflowScrollAxis = "both" | "x" | "y";

/** Opciones de {@link useOverflowScroll}. Todas son opcionales. */
export interface UseOverflowScrollOptions<T extends HTMLElement = HTMLDivElement> {
	/**
	 * Ref externa a fusionar. El hook escribe el nodo en `ref.current`, lo que
	 * permite combinarlo con `forwardRef`, virtualizers u otros observers.
	 */
	ref?: MutableRefObject<T | null>;
	/** Desactiva el arrastre sin desmontar el hook. @defaultValue false */
	disabled?: boolean;
	/** Ejes arrastrables. @defaultValue "both" */
	axis?: OverflowScrollAxis;
	/** Multiplicador aplicado al desplazamiento del puntero. @defaultValue 1 */
	multiplier?: number;
	/** Píxeles a recorrer antes de considerar el gesto un arrastre. @defaultValue 5 */
	dragThreshold?: number;
	/** Si el hook escribe `cursor: grab/grabbing` inline. @defaultValue true */
	manageCursor?: boolean;
	/**
	 * Si el hook escribe `overflow: auto` inline cuando hay desbordamiento.
	 * Respeta `axis`: con `"x"` escribe `overflow-x`, con `"y"` escribe `overflow-y`.
	 * Ponlo a `false` si prefieres controlar el overflow desde tu CSS.
	 * @defaultValue true
	 */
	manageOverflow?: boolean;
	/**
	 * Selector CSS de descendientes que no deben iniciar un arrastre.
	 * Reemplaza al valor por defecto, no se suma a él.
	 */
	ignoreSelector?: string;
	/** Se invoca cuando el gesto supera `dragThreshold`. */
	onDragStart?: (event: PointerEvent) => void;
	/** Se invoca al terminar o cancelarse un arrastre real. */
	onDragEnd?: (event: PointerEvent) => void;
}

/** Valor devuelto por {@link useOverflowScroll}. */
export interface UseOverflowScrollResult<T extends HTMLElement = HTMLDivElement> {
	/**
	 * Callback ref que debe pasarse al elemento scrollable. Al ser un callback,
	 * el enlace sigue al nodo aunque se monte más tarde o se remonte.
	 */
	ref: RefCallback<T>;
	/** Acceso imperativo al nodo. `null` antes del montaje y tras el desmontaje. */
	nodeRef: MutableRefObject<T | null>;
	/** `true` mientras hay un arrastre real en curso. No provoca re-render. */
	isDraggingRef: MutableRefObject<boolean>;
}

/**
 * Descendientes que no inician un arrastre por defecto.
 *
 * Solo controles de entrada: ahí el gesto del ratón significa colocar el caret o
 * seleccionar texto, y robarlo sería un error. Los enlaces y botones SÍ inician
 * arrastre a propósito — un carrusel suele estar hecho de tarjetas enlazadas, y
 * excluirlos lo dejaría inservible. A esos los protege la supresión del `click`
 * posterior a un arrastre real.
 */
export const DEFAULT_IGNORE_SELECTOR =
	"input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-no-drag]";

/** Propiedades inline que el hook puede escribir y debe restaurar al limpiar. */
const MANAGED_STYLE_PROPS = [
	"cursor",
	"overflow",
	"overflow-x",
	"overflow-y",
	"user-select",
	"-webkit-user-select",
];

/** `useLayoutEffect` en cliente, `useEffect` en servidor: evita el warning de SSR. */
const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Opciones con todos los valores por defecto ya aplicados. */
interface ResolvedOptions {
	disabled: boolean;
	axis: OverflowScrollAxis;
	multiplier: number;
	dragThreshold: number;
	manageCursor: boolean;
	manageOverflow: boolean;
	ignoreSelector: string;
	onDragStart?: (event: PointerEvent) => void;
	onDragEnd?: (event: PointerEvent) => void;
}

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
	/** `true` una vez superado `dragThreshold`. */
	active: boolean;
}

/** Lo que {@link install} devuelve al hook. */
interface Installation {
	/** Revierte todo lo instalado sobre el nodo. */
	teardown: () => void;
	/** Fuerza una re-medición del desbordamiento. */
	measure: () => void;
}

/**
 * Instala el comportamiento sobre un nodo concreto.
 *
 * Vive fuera del hook a propósito: recibir `node` ya no nulo por firma evita
 * depender del estrechamiento de tipos dentro de funciones elevadas (hoisted).
 *
 * @param node - Contenedor scrollable.
 * @param optionsRef - Opciones resueltas; se leen en cada evento, de modo que
 * cambiarlas no obliga a reinstalar los listeners.
 * @param isDraggingRef - Ref compartida con el hook.
 * @returns Ver {@link Installation}.
 */
function install<T extends HTMLElement>(
	node: T,
	optionsRef: MutableRefObject<ResolvedOptions>,
	isDraggingRef: MutableRefObject<boolean>
): Installation {
	const view = node.ownerDocument.defaultView;

	// Instantánea de los estilos inline previos, para restaurarlos al limpiar.
	const styleSnapshot: Record<string, string> = {};
	MANAGED_STYLE_PROPS.forEach((prop) => {
		styleSnapshot[prop] = node.style.getPropertyValue(prop);
	});

	let session: DragSession | null = null;
	let suppressClick = false;
	let canDragX = false;
	let canDragY = false;
	let draggable = false;
	let resizeObserver: ResizeObserver | null = null;
	let mutationObserver: MutationObserver | null = null;

	function restoreStyle(prop: string): void {
		const previous = styleSnapshot[prop];
		if (previous) node.style.setProperty(prop, previous);
		else node.style.removeProperty(prop);
	}

	/** Escribe `overflow` solo en los ejes que el consumidor permite arrastrar. */
	function applyOverflow(opts: ResolvedOptions): void {
		const overflowing = canDragX || canDragY;
		const prop =
			opts.axis === "x" ? "overflow-x" : opts.axis === "y" ? "overflow-y" : "overflow";

		// Restaura siempre las otras variantes: `axis` puede haber cambiado.
		["overflow", "overflow-x", "overflow-y"]
			.filter((other) => other !== prop)
			.forEach(restoreStyle);

		if (overflowing) node.style.setProperty(prop, "auto");
		else restoreStyle(prop);
	}

	function measure(): void {
		const opts = optionsRef.current;
		const overflowX = node.scrollWidth > node.clientWidth;
		const overflowY = node.scrollHeight > node.clientHeight;

		canDragX = opts.axis !== "y" && overflowX;
		canDragY = opts.axis !== "x" && overflowY;
		draggable = !opts.disabled && (canDragX || canDragY);

		node.dataset.overflowing = draggable ? "true" : "false";

		// Nunca se escribe `visible`: eso machacaba el CSS del consumidor (incluido
		// un `overflow: hidden` deliberado) y dejaba el contenido fuera de la caja.
		if (opts.manageOverflow) applyOverflow(opts);
		else ["overflow", "overflow-x", "overflow-y"].forEach(restoreStyle);

		if (opts.manageCursor && !isDraggingRef.current) {
			if (draggable) node.style.setProperty("cursor", "grab");
			else restoreStyle("cursor");
		} else if (!opts.manageCursor) {
			restoreStyle("cursor");
		}
	}

	function endSession(pointerId: number): void {
		session = null;
		isDraggingRef.current = false;

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
		const opts = optionsRef.current;
		suppressClick = false;

		if (opts.disabled || !draggable) return;
		if (!event.isPrimary || event.button !== 0) return;
		// Ctrl+click en macOS abre el menú contextual: no es un arrastre.
		if (event.ctrlKey) return;
		// El táctil se deja al scroll nativo, que ya trae inercia del sistema.
		if (event.pointerType === "touch") return;

		const target = event.target;
		if (
			opts.ignoreSelector &&
			target instanceof Element &&
			target.closest(opts.ignoreSelector)
		) {
			return;
		}

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

		const opts = optionsRef.current;

		if (!current.active) {
			const dx = Math.abs(event.clientX - current.originX);
			const dy = Math.abs(event.clientY - current.originY);
			if (Math.max(dx, dy) < opts.dragThreshold) return;

			// Reancla en el punto de activación para que no haya salto.
			current.active = true;
			current.anchorX = event.clientX;
			current.anchorY = event.clientY;
			current.anchorScrollLeft = node.scrollLeft;
			current.anchorScrollTop = node.scrollTop;

			isDraggingRef.current = true;
			node.dataset.dragging = "true";
			node.style.setProperty("user-select", "none");
			node.style.setProperty("-webkit-user-select", "none");
			if (opts.manageCursor) node.style.setProperty("cursor", "grabbing");
			view?.getSelection()?.removeAllRanges();
			opts.onDragStart?.(event);
		}

		event.preventDefault();

		// Delta absoluto sobre clientX/clientY, no movementX/movementY: aquel
		// deriva de screenX y se descuadra con zoom de página o escalado del SO.
		if (canDragX) {
			node.scrollLeft =
				current.anchorScrollLeft -
				(event.clientX - current.anchorX) * opts.multiplier;
		}
		if (canDragY) {
			node.scrollTop =
				current.anchorScrollTop -
				(event.clientY - current.anchorY) * opts.multiplier;
		}
	}

	function handlePointerEnd(event: PointerEvent): void {
		const current = session;
		if (!current || event.pointerId !== current.pointerId) return;

		const wasActive = current.active;
		endSession(event.pointerId);

		if (wasActive) {
			// Un arrastre real no debe activar el enlace o botón bajo el cursor.
			suppressClick = true;
			optionsRef.current.onDragEnd?.(event);
		}
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

	return {
		measure,
		teardown: () => {
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
		},
	};
}

/**
 * Añade scroll por arrastre ("grab to scroll") a un elemento con desbordamiento.
 *
 * Detecta si el contenido desborda y solo entonces activa el arrastre. Vuelve a
 * medir con `ResizeObserver` y `MutationObserver`, así que funciona con datos
 * que llegan de forma asíncrona o imágenes que terminan de cargar.
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
 * @typeParam T - Tipo del elemento contenedor. @defaultValue HTMLDivElement
 * @param options - Ver {@link UseOverflowScrollOptions}.
 * @returns Ver {@link UseOverflowScrollResult}.
 *
 * @example
 * ```tsx
 * const { ref } = useOverflowScroll<HTMLUListElement>({ axis: "x" });
 * return <ul ref={ref} className="carrusel">{items}</ul>;
 * ```
 */
export default function useOverflowScroll<T extends HTMLElement = HTMLDivElement>(
	options: UseOverflowScrollOptions<T> = {}
): UseOverflowScrollResult<T> {
	const {
		ref: externalRef,
		disabled = false,
		axis = "both",
		multiplier = 1,
		dragThreshold = 5,
		manageCursor = true,
		manageOverflow = true,
		ignoreSelector = DEFAULT_IGNORE_SELECTOR,
		onDragStart,
		onDragEnd,
	} = options;

	const internalRef = useRef<T | null>(null);
	const nodeRef = externalRef ?? internalRef;

	const isDraggingRef = useRef(false);
	const installationRef = useRef<Installation | null>(null);

	const optionsRef = useRef<ResolvedOptions>({
		disabled,
		axis,
		multiplier,
		dragThreshold,
		manageCursor,
		manageOverflow,
		ignoreSelector,
		onDragStart,
		onDragEnd,
	});

	// Mantiene las opciones al día sin reinstalar listeners, y re-mide cuando
	// cambia algo que afecta a la decisión de "arrastrable".
	useIsomorphicLayoutEffect(() => {
		optionsRef.current = {
			disabled,
			axis,
			multiplier,
			dragThreshold,
			manageCursor,
			manageOverflow,
			ignoreSelector,
			onDragStart,
			onDragEnd,
		};
		installationRef.current?.measure();
	}, [
		disabled,
		axis,
		multiplier,
		dragThreshold,
		manageCursor,
		manageOverflow,
		ignoreSelector,
		onDragStart,
		onDragEnd,
	]);

	const attach = useCallback<RefCallback<T>>(
		(node) => {
			// Desmonta la instalación anterior antes de enlazar el nodo nuevo.
			installationRef.current?.teardown();
			installationRef.current = null;
			nodeRef.current = node;

			if (node) installationRef.current = install(node, optionsRef, isDraggingRef);
		},
		[nodeRef]
	);

	// Red de seguridad por si el árbol se desmonta sin invocar el callback ref.
	useEffect(() => {
		return () => {
			installationRef.current?.teardown();
			installationRef.current = null;
		};
	}, []);

	return { ref: attach, nodeRef, isDraggingRef };
}
