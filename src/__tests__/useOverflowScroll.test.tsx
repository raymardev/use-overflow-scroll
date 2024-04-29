// src/__tests__/useOverflowScroll.test.tsx
import { render, fireEvent, cleanup } from "@testing-library/react";
import { OverflowedComponent } from "./mocks/OverflowedComponent";

describe("useOverflowScroll", () => {
	let addEventListenerSpy: jest.SpyInstance;
	let removeEventListenerSpy: jest.SpyInstance;

	beforeEach(() => {
		addEventListenerSpy = jest.spyOn(document, "addEventListener");
		removeEventListenerSpy = jest.spyOn(document, "removeEventListener");
	});

	afterEach(() => {
		cleanup();
		jest.clearAllMocks();
	});

	it("should add overflow auto on overflowed element", () => {
		const { getByTestId } = render(<OverflowedComponent />);
		const overflowedElement = getByTestId("overflowed-div");
		const isOverflowed =
			overflowedElement.scrollHeight > overflowedElement.clientHeight ||
			overflowedElement.scrollWidth > overflowedElement.clientWidth;

		const status = isOverflowed ? "auto" : "visible";

		expect(overflowedElement.style.overflow).toBe(status);
	});

	it("should allow an overflowed element to be dragged", () => {
		const { getByTestId } = render(<OverflowedComponent />);
		const overflowedElement = getByTestId("overflowed-div");

		fireEvent.mouseDown(overflowedElement, { clientX: 50, clientY: 50 });
		expect(overflowedElement.style.cursor).toBe("grabbing");

		fireEvent.mouseMove(overflowedElement, { clientX: 60, clientY: 60 });

		fireEvent.mouseUp(overflowedElement);
		expect(overflowedElement.style.cursor).toBe("grab");
	});

	it("should clean up event listeners on unmount", () => {
		const { unmount } = render(<OverflowedComponent />);
		unmount();

		expect(removeEventListenerSpy).toHaveBeenCalledTimes(2);
	});

	it("should not add event listeners if ref is null", () => {
		const { unmount } = render(<OverflowedComponent />);
		unmount();

		expect(addEventListenerSpy).not.toHaveBeenCalled();
	});

	it("number of event listeners added should be equal to number of remove event listeners", () => {
		const { getByTestId } = render(<OverflowedComponent />);
		const overflowedElement = getByTestId("overflowed-div");

		fireEvent.mouseDown(overflowedElement, { clientX: 50, clientY: 50 });
		fireEvent.mouseUp(overflowedElement);

		expect(addEventListenerSpy).toHaveBeenCalledTimes(
			removeEventListenerSpy.mock.calls.length
		);
	});
});
