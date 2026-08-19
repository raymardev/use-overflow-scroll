import useOverflowScroll from "../../hooks/useOverflowScroll";

export interface OverflowedComponentProps {
	/** Handler del enlace hijo, para comprobar la supresión del click. */
	onLinkClick?: () => void;
	/** Permite probar el caso de un contenedor que nunca se monta. */
	attachRef?: boolean;
}

export function OverflowedComponent({
	onLinkClick,
	attachRef = true,
}: OverflowedComponentProps) {
	const ref = useOverflowScroll();

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
