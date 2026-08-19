# useOverflowScroll

`use-overflow-scroll` is a React hook that adds click-and-drag scrolling to a
container — and, unlike other drag-scroll libraries, **turns itself on only when
the content actually overflows**. You do not have to know in advance whether a
container will need to scroll.

Desktop browsers have no native drag-to-scroll for the mouse: you get the wheel,
the scrollbar, the keyboard and middle-click autoscroll, but not click-and-drag.
This hook fills that gap without taking anything away from the interactions the
browser already provides.

## Installation

```bash
npm install use-overflow-scroll
```

```bash
yarn add use-overflow-scroll
```

React 17, 18 and 19 are supported as peer dependencies.

## Usage

Call the hook and assign the ref it returns to your scrollable element.

```jsx
import useOverflowScroll from "use-overflow-scroll";

function Carousel({ products }) {
	const ref = useOverflowScroll();

	return (
		<div ref={ref} className="carousel" tabIndex={0} aria-label="Featured products">
			{products.map((product) => (
				<a key={product.id} href={`/product/${product.id}`}>
					{product.name}
				</a>
			))}
		</div>
	);
}
```

The hook takes no arguments and returns the ref. That ref is a standard
`RefObject<HTMLDivElement>`, so `ref.current` is `null` before mount and after
unmount — check it before using it imperatively.

## What the hook does for you

- **Measures overflow and keeps measuring.** It sets `overflow: auto` and
  `cursor: grab` only while the content overflows, and re-measures through a
  `ResizeObserver` and a `MutationObserver`. Content that arrives from a `fetch`,
  images that finish loading and viewport resizes are all picked up.
- **Never fights your CSS.** It only ever *sets* `overflow: auto`. It does not
  write `overflow: visible`, so a container you deliberately set to
  `overflow: hidden` is left alone. Every inline style it writes is restored on
  unmount.
- **Waits before it decides you are dragging.** Nothing is suppressed until the
  pointer travels 5px. Below that threshold the gesture stays a plain click:
  focus, caret placement and text selection keep working.
- **Protects your links and buttons.** After a real drag, the `click` that the
  browser fires next is swallowed, so dragging a carousel of link cards scrolls
  it instead of navigating. A click without a drag still activates the link.
- **Leaves input controls alone.** Pressing on an `input`, `textarea`, `select`
  or `contenteditable` never starts a drag. Add `data-no-drag` to any other
  element that should behave the same way.
- **Ends the gesture reliably.** It uses Pointer Events with
  `setPointerCapture`, so releasing outside the window, an Alt-Tab mid-drag or a
  context menu all end the drag cleanly instead of leaving it stuck.
- **Stays out of the way on touch.** Touch pointers are ignored, so mobile keeps
  the native scroll with the operating system's own inertia.
- **Is safe to server-render.** It touches no browser global during render.

## Styling hooks

The hook keeps two data attributes on the element so your CSS can react without
causing a re-render:

| Attribute | Values | Meaning |
|---|---|---|
| `data-overflowing` | `"true"` / `"false"` | The content currently overflows and can be dragged. |
| `data-dragging` | `"true"` / absent | A real drag is in progress. |

```css
.carousel[data-overflowing="true"] { cursor: grab; }
.carousel[data-dragging="true"] { cursor: grabbing; scroll-behavior: auto; }
```

## What you still need to provide

The hook manages `overflow`, `cursor` and `user-select`. Everything else is
yours — in particular, **keyboard access**. A scroll container is not reachable
by keyboard on its own, so give it `tabIndex={0}` and an `aria-label`:

```jsx
<div ref={ref} tabIndex={0} aria-label="Featured products">
```

## Limitations

- The drag gesture is mouse and pen only. Touch is intentionally left to native
  scrolling.
- There are no options yet — axis locking, a scroll multiplier, a disabled flag
  and momentum are planned for 2.0, along with support for element types other
  than `div`.
- The ref binds on mount. A container mounted conditionally on a later render is
  not picked up.

## Testing

```bash
npm test
```

The suite runs against jsdom, which performs no layout, so the element size
getters are stubbed to simulate overflow. `PointerEvent`, the pointer capture
API and `ResizeObserver` are polyfilled in `jest.setup.ts`.

## Contributing

Issues and pull requests are welcome. Please run `npm run lint`,
`npm run typecheck` and `npm test` before opening one.

## License

MIT
