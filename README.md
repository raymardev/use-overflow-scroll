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

React 17, 18 and 19 are supported as peer dependencies. The package ships both
ESM and CommonJS builds with their own type declarations.

## Usage

Call the hook and assign the returned `ref` to your scrollable element.

```jsx
import useOverflowScroll from "use-overflow-scroll";

function Carousel({ products }) {
	const { ref } = useOverflowScroll();

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

With options, and on an element that is not a `div`:

```tsx
const { ref } = useOverflowScroll<HTMLUListElement>({
	axis: "x",
	multiplier: 1.2,
	dragThreshold: 6,
});

return <ul ref={ref} className="carousel">{items}</ul>;
```

## Options

Every option is optional.

| Option | Type | Default | What it does |
|---|---|---|---|
| `ref` | `MutableRefObject<T \| null>` | — | An external ref to merge, for `forwardRef`, virtualizers or your own observers. |
| `disabled` | `boolean` | `false` | Turns dragging off without unmounting the hook. |
| `axis` | `"both" \| "x" \| "y"` | `"both"` | Which axes may be dragged. |
| `multiplier` | `number` | `1` | Scales pointer travel into scroll distance. |
| `dragThreshold` | `number` | `5` | Pixels to travel before the gesture counts as a drag. |
| `manageCursor` | `boolean` | `true` | Whether the hook writes `cursor: grab/grabbing`. |
| `manageOverflow` | `boolean` | `true` | Whether the hook writes `overflow: auto`. Respects `axis`. |
| `ignoreSelector` | `string` | input controls | Descendants that never start a drag. Replaces the default, does not extend it. |
| `onDragStart` | `(e: PointerEvent) => void` | — | Fires once the gesture passes `dragThreshold`. |
| `onDragEnd` | `(e: PointerEvent) => void` | — | Fires when a real drag ends or is cancelled. |

## Return value

```ts
{
	ref: RefCallback<T>;                       // pass this to your element
	nodeRef: MutableRefObject<T | null>;       // imperative access to the node
	isDraggingRef: MutableRefObject<boolean>;  // true during a real drag, no re-render
}
```

`ref` is a callback ref, so it follows the node even if the container mounts on a
later render or remounts.

## What the hook does for you

- **Measures overflow and keeps measuring.** It re-measures through a
  `ResizeObserver` and a `MutationObserver`. Content that arrives from a `fetch`,
  images that finish loading and viewport resizes are all picked up.
- **Never fights your CSS.** It only ever *sets* `overflow: auto`, on the axis
  you allow. It does not write `overflow: visible`, so a container you
  deliberately set to `overflow: hidden` is left alone. Every inline style it
  writes is restored on unmount. Set `manageOverflow: false` to own it yourself.
- **Waits before it decides you are dragging.** Nothing is suppressed until the
  pointer passes `dragThreshold`. Below it the gesture stays a plain click:
  focus, caret placement and text selection keep working.
- **Protects your links and buttons.** After a real drag, the `click` the browser
  fires next is swallowed, so dragging a carousel of link cards scrolls it
  instead of navigating. A click without a drag still activates the link.
- **Leaves input controls alone.** Pressing on an `input`, `textarea`, `select`
  or `contenteditable` never starts a drag. Add `data-no-drag` to any other
  element that should behave the same way.
- **Ends the gesture reliably.** It uses Pointer Events with
  `setPointerCapture`, so releasing outside the window, an Alt-Tab mid-drag or a
  context menu all end the drag cleanly instead of leaving it stuck.
- **Stays out of the way on touch.** Touch pointers are ignored, so mobile keeps
  native scrolling with the operating system's own inertia.
- **Is safe to server-render.** It touches no browser global during render.

## Styling hooks

The hook keeps two data attributes on the element so your CSS can react without
causing a re-render:

| Attribute | Values | Meaning |
|---|---|---|
| `data-overflowing` | `"true"` / `"false"` | The content overflows and can be dragged. |
| `data-dragging` | `"true"` / absent | A real drag is in progress. |

```css
.carousel[data-overflowing="true"] { cursor: grab; }
.carousel[data-dragging="true"] { cursor: grabbing; scroll-behavior: auto; }
```

## Accessibility

The hook manages `overflow`, `cursor` and `user-select`. **Keyboard access is
yours.** A scroll container is not reachable by keyboard on its own, so give it
`tabIndex={0}` and an `aria-label`:

```jsx
<div ref={ref} tabIndex={0} aria-label="Featured products">
```

## Migrating from 1.x

The hook now takes an options object and returns an object instead of a bare
ref. Everything else about how you use it is unchanged.

```diff
- const ref = useOverflowScroll();
+ const { ref } = useOverflowScroll();

  return <div ref={ref}>{children}</div>;
```

If you used the ref imperatively, read `nodeRef` instead:

```diff
- const ref = useOverflowScroll();
- ref.current?.scrollTo({ left: 0 });
+ const { ref, nodeRef } = useOverflowScroll();
+ nodeRef.current?.scrollTo({ left: 0 });
```

Behavioural changes to be aware of:

- Dragging now requires 5px of travel. A press that does not move stays a plain
  click, which is what makes nested links and inputs usable.
- `overflow` is written per axis when you set `axis`, and is never set to
  `visible`. If you relied on the hook forcing `overflow: visible` on
  non-overflowing containers, that is gone — it was overwriting your stylesheet.
- Touch pointers no longer reach the hook at all. Mobile keeps native scrolling.
- The 1.x `UseOverflowScroll` type is replaced by `UseOverflowScrollResult`.

`use-overflow-scroll@1.0.1` was published without its `dist/` directory and
cannot be installed. Use 1.0.0, or upgrade.

## Limitations

- The drag gesture is mouse and pen only. Touch is intentionally left to native
  scrolling.
- There is no momentum or inertia after release.
- Nested scroll containers each handle their own gesture, but there is no
  chaining once one reaches its edge.

## Development

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The test suite runs against jsdom, which performs no layout, so the element size
getters are stubbed to simulate overflow. `PointerEvent`, the pointer capture API
and `ResizeObserver` are polyfilled in `jest.setup.ts`.

`npm run check:pkg` runs [publint](https://publint.dev) over the built package.

## Contributing

Issues and pull requests are welcome. Please run the commands above before
opening one.

## License

MIT
