import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Capas: dominio no depende de nada; backend solo de dominio; la interfaz de ambos.
const capa = (desde, prohibidas) => ({
  files: [`src/${desde}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: prohibidas.map((c) => ({ group: [`**/${c}/*`], message: `La capa ${desde} no puede depender de ${c}.` })),
    }],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  { files: ['src/i18n/**', 'src/backend/**'], rules: { 'react-refresh/only-export-components': 'off' } },
  capa('dominio', ['backend', 'componentes', 'pestanas', 'hooks', 'i18n']),
  capa('backend', ['componentes', 'pestanas', 'hooks', 'i18n']),
);
