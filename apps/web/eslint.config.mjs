import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    rules: {
      // Client pages intentionally fetch on mount; the rule false-positives on async loaders.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
