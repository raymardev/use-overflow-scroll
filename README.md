# UseOverflowScroll

`use-overflow-scroll` is a custom React hook designed to add draggable scroll functionality to any scrollable div element in your React application. This hook makes it easy to click and drag to scroll through content, mimicking the interaction style of touch interfaces.

## Installation

You can install `use-overflow-scroll` using npm or yarn:

```bash
npm install use-overflow-scroll
```

```bash
yarn add use-overflow-scroll
```

## Usage

To use `use-overflow-scroll`, import the hook and call it in your component. The hook takes a single argument, a ref to the scrollable element you want to add draggable scroll functionality to.

```jsx
import useOverflowScroll from 'use-overflow-scroll';

const MyComponent = () => {
	const scrollRef = useOverflowScroll();

	return (
		<div ref={scrollRef} style={{ overflow: 'auto', height: '300px' }}>
			{/* Your scrollable content here */}
		</div>
	);
};
```

## Props

`use-overflow-scroll` does not take any props.

## Testing

To run the test suite for `use-overflow-scroll`, you can use the following command:

```bash
npm test
```

## Contributing

If you would like to contribute to `use-overflow-scroll`, please open an issue or submit a pull request.

## License

`use-overflow-scroll` is licensed under the MIT license.

