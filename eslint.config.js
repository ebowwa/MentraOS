const {defineConfig, globalIgnores} = require("eslint/config")

const reactotron = require("eslint-plugin-reactotron")
const prettier = require("eslint-plugin-prettier")
const js = require("@eslint/js")

const {FlatCompat} = require("@eslint/eslintrc")

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

module.exports = defineConfig([
  {
    extends: compat.extends(
      "plugin:@typescript-eslint/recommended",
      "plugin:react/recommended",
      "plugin:react-native/all",
      "plugin:react/jsx-runtime",
    ),

    plugins: {
      reactotron,
      prettier,
    },

    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/array-type": 0,
      "@typescript-eslint/ban-ts-comment": 0,
      "@typescript-eslint/no-explicit-any": 0,

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-var-requires": 0,
      "@typescript-eslint/no-require-imports": 0,
      "@typescript-eslint/no-empty-object-type": 0,
      "no-use-before-define": 0,

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

      "react/prop-types": 0,
      "react-native/no-raw-text": 0,
      "reactotron/no-tron-in-production": "error",
      "comma-dangle": 0,
      "no-global-assign": 0,
      "quotes": 0,
      "space-before-function-paren": 0,
    },
  },
  globalIgnores([
    "**/node_modules",
    "**/ios",
    "**/android",
    "**/.expo",
    "**/.vscode",
    "ignite/ignite.json",
    "**/package.json",
    "**/.eslintignore",
  ]),
])
