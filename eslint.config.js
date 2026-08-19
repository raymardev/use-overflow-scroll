const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = tseslint.config(
	{ ignores: ["dist/**", "node_modules/**"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["src/**/*.{ts,tsx}"],
		plugins: { "react-hooks": reactHooks },
		rules: {
			...reactHooks.configs.recommended.rules,
		},
	},
	{
		files: ["*.js", "jest.setup.ts"],
		languageOptions: { globals: { module: "writable", require: "readonly" } },
		rules: { "@typescript-eslint/no-require-imports": "off" },
	}
);
