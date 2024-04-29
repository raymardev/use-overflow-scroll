module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	testMatch: ["**/__tests__/**/*.test.ts?(x)"],
	setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
	transform: {
		"^.+\\.(ts|tsx)$": "ts-jest",
	},
	moduleNameMapper: {
		"\\.(css|less|sass|scss)$": "identity-obj-proxy",
	},
	transform: {
		"^.+\\.(ts|tsx|js|jsx)$": "ts-jest",
	},
	testPathIgnorePatterns: ["/node_modules/"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
