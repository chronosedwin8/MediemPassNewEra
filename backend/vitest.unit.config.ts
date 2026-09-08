import { defineConfig } from 'vitest/config';

/**
 * Pruebas unitarias: lógica pura, sin base de datos ni red. Deben ser rápidas
 * y ejecutables en cualquier máquina sin preparación previa.
 */
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    env: { NODE_ENV: 'test' },
  },
});
