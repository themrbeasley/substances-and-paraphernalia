import globals from "globals";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";

// Only globals that exist un-deprecated in Foundry V14. Removed/deprecated ones
// (mergeObject, renderTemplate, Dialog, …) are left out on purpose so a bare
// use fails `no-undef`; use the `foundry.*` namespaces instead.
// V13 duration fields that V14 replaced with duration.value + duration.units.
const LEGACY_DURATION = "/^(seconds|rounds|turns|startTime|startRound|startTurn)$/";

const foundryGlobals = {
  game: "readonly",
  ui: "readonly",
  CONFIG: "readonly",
  CONST: "readonly",
  Hooks: "readonly",
  foundry: "readonly",
  canvas: "readonly",
  Roll: "readonly",
  ChatMessage: "readonly",
  Actor: "readonly",
  Item: "readonly",
  Macro: "readonly",
  JournalEntry: "readonly",
  ActiveEffect: "readonly",
  fromUuid: "readonly",
  fromUuidSync: "readonly",
  Handlebars: "readonly",
  dnd5e: "readonly",
};

export default [
  {
    ignores: ["packs/**", "node_modules/**", "dist/**"],
  },
  {
    files: ["scripts/**/*.{js,mjs}", "test/**/*.{js,mjs}", "_source/fishut-illicit-macros/**/*.js"],
    plugins: { import: importPlugin },
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
      // Catches "imported name does not exist" (the v0.8.1 regression class).
      "import/named": "error",
      "no-restricted-properties": [
        "error",
        {
          object: "CONST",
          property: "ACTIVE_EFFECT_MODES",
          message: "Deprecated in V14. Change rows use string types (CONST.ACTIVE_EFFECT_CHANGE_TYPES).",
        },
      ],
    },
  },
  {
    // Module code only: test fixtures legitimately build legacy shapes.
    files: ["scripts/**/*.{js,mjs}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        // Legacy V13 effect data, read or written (the A1 and A3 bug classes).
        {
          selector: [
            `MemberExpression[object.property.name="duration"][property.name=${LEGACY_DURATION}]`,
            `Property[key.name="duration"] > ObjectExpression > Property[key.name=${LEGACY_DURATION}]`,
            `AssignmentExpression[left.property.name="duration"] > ObjectExpression > Property[key.name=${LEGACY_DURATION}]`,
          ].join(", "),
          message: "V14 durations are duration.value + duration.units. Use prepareEffectPayload() from data/effect-data.js.",
        },
        {
          selector: [
            'MemberExpression[property.name="changes"]:not([object.property.name="system"])',
            'ObjectExpression:not(Property[key.name="system"] > ObjectExpression):not(AssignmentExpression[left.property.name="system"] > ObjectExpression) > Property:matches([key.name="changes"], [key.value="changes"])',
            'ObjectPattern > Property[key.name="changes"]',
            'MemberExpression[computed=true][property.value="changes"]',
            'CallExpression[callee.property.name=/^(getProperty|setProperty|hasProperty)$/] > Literal[value=/^changes(\\.|$)/]',
          ].join(", "),
          message: "V14 stores change rows at system.changes. Write { system: { changes } } and read with effectChanges() from data/effect-data.js.",
        },
        {
          selector: 'Property[key.name="mode"][value.type="Literal"], MemberExpression[computed=false][property.name="mode"]',
          message: "V14 change rows use a string type (\"override\", \"add\", \"custom\"), not a numeric mode.",
        },
      ],
    },
  },
  {
    files: ["tools/**/*.{js,mjs}"],
    plugins: { import: importPlugin },
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
      "import/named": "error",
    },
  },
  prettier,
];
