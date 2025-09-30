import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import pluginReact from "eslint-plugin-react"
import json from "@eslint/json"
import markdown from "@eslint/markdown"
import css from "@eslint/css"
import {defineConfig} from "eslint/config"

export default defineConfig([
  {files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: {js}, extends: ["js/recommended"]},
  {files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], languageOptions: {globals: globals.node}},
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  // {files: ["**/*.json"], plugins: {json}, language: "json/json", extends: ["json/recommended"]},
  // {files: ["**/*.css"], plugins: {css}, language: "css/css", extends: ["css/recommended"]},
  {
    // Apply to all files
    rules: {
      // Override all rules to be warnings
      ...Object.fromEntries(
        Object.keys(js.configs.recommended.rules || {}).map(key => [key, "warn"])
      ),
      ...Object.fromEntries(
        Object.keys(tseslint.configs.recommended.rules || {}).map(key => [key, "warn"])
      ),
      ...Object.fromEntries(
        Object.keys(pluginReact.configs.flat.recommended.rules || {}).map(key => [key, "warn"])
      ),
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "prefer-const": "warn",
      // "@typescript-eslint/naming-convention": [
      //   "error",
      //   {selector: "default", format: ["camelCase"]},
      //   {selector: "variableLike", format: ["camelCase"]},
      //   {selector: "variable", format: ["camelCase", "UPPER_CASE"]},
      //   {selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow"},
      //   {selector: "memberLike", format: ["camelCase"]},
      //   // {selector: "memberLike", modifiers: ["private"], format: ["camelCase"], leadingUnderscore: "require"},
      //   {selector: "typeLike", format: ["PascalCase"]},
      //   {selector: "typeParameter", format: ["PascalCase"], prefix: ["T"]},
      //   {selector: "interface", format: ["PascalCase"], custom: {regex: "^I[A-Z]", match: false}},
      // ],
    },
  },
])
