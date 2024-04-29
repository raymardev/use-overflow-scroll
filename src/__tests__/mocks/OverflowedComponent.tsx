import useOverflowScroll from "../../hooks/useOverflowScroll";

export function OverflowedComponent() {
	const ref = useOverflowScroll();

	return (
		<div
			ref={ref}
			data-testid="overflowed-div"
			style={{ width: "100px", height: "100px" }}
		>
			<div style={{ width: "300px", height: "300px" }}>Drag Me</div>
		</div>
	);
}
