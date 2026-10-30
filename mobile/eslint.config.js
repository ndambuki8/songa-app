// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}){1,2}$/]',
          message: 'Raw hex colors are not allowed. Use a SONGA_THEME token from @/theme.',
        },
        {
          selector: 'Literal[value=/^rgba?\\(/]',
          message: 'Raw rgb colors are not allowed. Use a SONGA_THEME token from @/theme.',
        },
      ],
    },
  },
]);
