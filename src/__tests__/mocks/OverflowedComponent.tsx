import { useState } from "react";
import useOverflowScroll from "../../hooks/useOverflowScroll";
import type { UseOverflowScrollOptions } from "../../hooks/useOverflowScroll";

export interface OverflowedComponentProps
	extends UseOverflowScrollOptions<HTMLDivElement> {
	/** Handler del enlace hijo, para comprobar la supresión del click. */
	onLinkClick?: () => void;
	/** Permite probar el caso de un contenedor que nunca se monta. */
	attachRef?: boolean;
}

export function OverflowedComponent({
	onLinkClick,
	attachRef = true,
	...options
}: OverflowedComponentProps) {
	const { ref } = useOverflowScroll(options);

	if (!attachRef) return <div data-testid="detached">sin ref</div>;

	return (
		<div ref={ref} data-testid="overflowed-div">
			<a href="/destino" data-testid="child-link" onClick={onLinkClick}>
				Enlace
			</a>
			<input data-testid="child-input" />
			<span data-testid="child-text">Drag Me</span>
		</div>
	);
}

/** Contenedor que solo aparece tras un render posterior al primero. */
export function LateMountedComponent() {
	const { ref } = useOverflowScroll();
	const [visible, setVisible] = useState(false);

	return (
		<>
			<button data-testid="show" onClick={() => setVisible(true)}>
				mostrar
			</button>
			{visible && (
				<div ref={ref} data-testid="overflowed-div">
					contenido
				</div>
			)}
		</>
	);
}

/** Usa el hook sobre un elemento que no es un div, con ref externa. */
export function ListComponent({
	externalRef,
}: {
	externalRef?: React.MutableRefObject<HTMLUListElement | null>;
}) {
	const { ref, nodeRef } = useOverflowScroll<HTMLUListElement>({
		ref: externalRef,
		axis: "x",
	});

	return (
		<ul ref={ref} data-testid="list" data-node={nodeRef.current ? "set" : "unset"}>
			<li>uno</li>
		</ul>
	);
}
