// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'src/components/hint-row.tsx',
      'src/components/themed-view.tsx',
      'src/constants/theme.ts',
      'src/hooks/use-theme.ts',
    ],
  }
]);
