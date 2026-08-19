/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: "jsdom",
	testMatch: ["**/__tests__/**/*.test.ts?(x)"],
	setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
	transform: {
		// El build publica ES5, pero los tests necesitan clases nativas: el
		// polyfill de PointerEvent extiende MouseEvent, y `class extends` sobre un
		// builtin no sobrevive a la transpilación a ES5.
		"^.+\\.(ts|tsx)$": [
			"ts-jest",
			{ tsconfig: { target: "es2020", jsx: "react-jsx", esModuleInterop: true } },
		],
	},
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
