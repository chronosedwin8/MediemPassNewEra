import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      'backend/prisma/migrations/**',
      'tools/phidias-probe-output/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Reglas transversales de calidad exigidas por la especificación (sección 62).
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      // `any` prohibido: la especificación exige TypeScript real.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Funciones gigantes: señal temprana de responsabilidades mezcladas.
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      complexity: ['warn', 12],
    },
  },

  // Backend: Node, con información de tipos para las reglas que la requieren.
  {
    files: ['backend/**/*.ts', 'packages/**/*.ts', 'tools/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // Frontend: navegador + Vue.
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['frontend/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/define-macros-order': ['error', { order: ['defineProps', 'defineEmits'] }],
      // Componentes gigantes: la especificación los prohíbe explícitamente.
      'vue/max-lines-per-block': ['warn', { template: 220, script: 200, style: 120 }],
    },
  },

  // Los tests relajan solo lo imprescindible.
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier,
);
