import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Las capas solo pueden depender hacia dentro:
//   presentation -> application -> domain      infrastructure -> application/domain
//   app (composicion) conoce a todas.
const layer = (from, banned) => ({
  files: [`src/${from}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: banned.map((l) => ({ group: [`@${l}/*`], message: `La capa ${from} no puede depender de ${l}.` })),
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
  // El router y el contexto no son componentes: la regla de recarga en caliente no aplica.
  { files: ['src/presentation/routes/**', 'src/presentation/di/**'], rules: { 'react-refresh/only-export-components': 'off' } },
  layer('domain', ['application', 'infrastructure', 'presentation', 'app']),
  layer('application', ['infrastructure', 'presentation', 'app']),
  layer('infrastructure', ['presentation', 'app']),
  layer('presentation', ['infrastructure']),
);
