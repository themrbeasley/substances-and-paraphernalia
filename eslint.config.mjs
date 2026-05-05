import globals from "globals";
import prettier from "eslint-config-prettier";

const foundryGlobals = {
  game: "readonly",
  ui: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  Hooks: "readonly",
  foundry: "readonly",
  canvas: "readonly",
  Roll: "readonly",
  Dialog: "readonly",
  DialogV2: "readonly",
  Application: "readonly",
  ApplicationV2: "readonly",
  HandlebarsApplicationMixin: "readonly",
  ChatMessage: "readonly",
  Actor: "readonly",
  Actors: "readonly",
  Item: "readonly",
  Items: "readonly",
  Macro: "readonly",
  JournalEntry: "readonly",
  ActiveEffect: "readonly",
  fromUuid: "readonly",
  fromUuidSync: "readonly",
  duplicate: "readonly",
  mergeObject: "readonly",
  expandObject: "readonly",
  flattenObject: "readonly",
  getProperty: "readonly",
  setProperty: "readonly",
  hasProperty: "readonly",
  loadTemplates: "readonly",
  renderTemplate: "readonly",
  Handlebars: "readonly",
  dnd5e: "readonly",
  Quench: "readonly",
};

export default [
  {
    ignores: ["packs/**", "node_modules/**", "dist/**"],
  },
  {
    files: ["scripts/**/*.{js,mjs}", "test/**/*.{js,mjs}", "_source/fishut-illicit-macros/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...foundryGlobals,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
      "prefer-const": "warn",
    },
  },
  {
    files: ["tools/**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
      "prefer-const": "warn",
    },
  },
  prettier,
];
