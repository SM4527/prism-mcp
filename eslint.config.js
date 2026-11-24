import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  ...tseslint.configs.recommended,
  {
    // stdout carries the MCP protocol: src/ may only write to stderr.
    files: ["src/**/*.ts"],
    rules: { "no-console": ["error", { allow: ["error", "warn"] }] },
  },
);
