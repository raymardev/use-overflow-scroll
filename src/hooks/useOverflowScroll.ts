import { useRef, useEffect } from "react";
import { UseOverflowScroll } from "../types/useOverflowScroll";

export default function useOverflowScroll(): UseOverflowScroll {
	const ref = useRef<HTMLDivElement>(null);
	const isDragging = useRef(false);
	const startPos = useRef({ x: 0, y: 0 });

	function handleMouseMove(event: MouseEvent) {
		const div = ref.current;
		if (!isDragging.current || !div) return;

		div.scrollLeft -= event.movementX;
		div.scrollTop -= event.movementY;
	}
	asd;

	function handleMouseUp() {
		const div = ref.current;
		if (!div) return;

		div.style.cursor = "grab";
		isDragging.current = false;
		removeEventListeners();
	}

	function handleMouseDown(event: MouseEvent) {
		const div = ref.current;
		if (!div) return;

		div.style.cursor = "grabbing";
		isDragging.current = true;
		startPos.current = {
			x: event.pageX - div.offsetLeft,
			y: event.pageY - div.offsetTop,
		};
		addEventListeners();
		event.preventDefault();
	}

	function addEventListeners() {
		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
	}

	function removeEventListeners() {
		document.removeEventListener("mousemove", handleMouseMove);
		document.removeEventListener("mouseup", handleMouseUp);
	}

	useEffect(() => {
		const div = ref.current;
		if (!div) return;

		const isOverflowed =
			div.scrollHeight > div.clientHeight || div.scrollWidth > div.clientWidth;

		div.style.overflow = isOverflowed ? "auto" : "visible";
		div.style.cursor = isOverflowed ? "grab" : "auto";

		div.addEventListener("mousedown", handleMouseDown);

		return () => {
			div.removeEventListener("mousedown", handleMouseDown);
			removeEventListeners();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return ref;
}
