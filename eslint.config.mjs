import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import pluginReact from "eslint-plugin-react"
import pluginReactNative from "eslint-plugin-react-native"
import pluginReactotron from "eslint-plugin-reactotron"
import pluginPrettier from "eslint-plugin-prettier"
import prettierConfig from "eslint-config-prettier"

export default [
  // Base config for all JS/TS files
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react": pluginReact,
      "react-native": pluginReactNative,
      "reactotron": pluginReactotron,
      "prettier": pluginPrettier,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        __DEV__: "readonly", // React Native global
      },
    },
    settings: {
      react: {
        version: "detect", // Automatically detect the React version
      },
    },
  },
  
  // Recommended configs
  js.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat["jsx-runtime"],
  prettierConfig,
  
  // All rule overrides in one place
  {
    rules: {
      // Prettier
      "prettier/prettier": "error",
      
      // TypeScript
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/array-type": "off",
      
      // React
      "react/prop-types": "off",
      
      // React Native - these rules are smart enough to only apply to RN code
      "react-native/no-unused-styles": "error",
      "react-native/split-platform-components": "warn",
      "react-native/no-inline-styles": "warn",
      "react-native/no-color-literals": "off",
      "react-native/no-raw-text": "off",
      
      // Reactotron
      "reactotron/no-tron-in-production": "error",
      
      // Core ESLint
      "prefer-const": "off",
      "no-use-before-define": "off",
      "comma-dangle": "off",
      "no-global-assign": "off",
      "quotes": "off",
      "space-before-function-paren": "off",
      "no-case-declarations": "warn",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["default"],
              message: "Import named exports from 'react' instead.",
            },
          ],
        },
      ],
    },
  },
  
  // Ignore patterns
  {
    ignores: [
      // Global ignores
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.vscode/**",
      
      // Mobile-specific ignores
      "mobile/ios/**",
      "mobile/android/**",
      "mobile/.expo/**",
      "mobile/ignite/ignite.json",
      "mobile/package.json",
      
      // You might also want to add these common RN ignores
      "mobile/**/*.gradle",
      "mobile/**/*.ipa",
      "mobile/**/*.apk",
      "mobile/**/*.aab",
    ],
  },
]