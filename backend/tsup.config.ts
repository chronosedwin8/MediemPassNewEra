import { defineConfig } from 'tsup';

/**
 * Compilación del backend para producción.
 *
 * Se empaqueta con tsup y no con `tsc` a secas por un motivo concreto del
 * monorepo: `@medienpass/shared` se publica como TypeScript (su `exports`
 * apunta a `src/index.ts`), así que `tsc` dejaría en el `dist` un `import` a
 * un paquete que en tiempo de ejecución no existe compilado. tsup lo resuelve
 * y lo incorpora al paquete.
 */
export default defineConfig({
  /*
   * Dos entradas, nombradas. La semilla se compila junto al servidor porque en
   * la imagen de producción tiene que poder ejecutarse: sembrar el marco KMK,
   * los roles y las escalas es parte de la primera puesta en marcha, no algo de
   * desarrollo.
   *
   * Se nombran en lugar de pasar una lista para que la salida sea
   * `dist/server.js` y `dist/seed.js`; con una lista, tsup conserva la ruta de
   * origen y los ficheros acabarían en `dist/src/` y `dist/prisma/seed/`.
   */
  entry: { server: 'src/server.ts', seed: 'prisma/seed/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  sourcemap: true,
  clean: true,

  // Sin división en trozos: un único fichero arranca más rápido y hace el
  // contenedor más simple de razonar.
  splitting: false,

  /*
   * `@medienpass/shared` se empaqueta; todo lo demás queda fuera y se resuelve
   * desde `node_modules`. Incluir Prisma o Express en el paquete rompería la
   * carga de sus binarios y motores nativos.
   */
  noExternal: ['@medienpass/shared'],

  // Las migraciones y el esquema se copian aparte, en la imagen: no son código.
  external: ['@prisma/client', '.prisma/client'],
});
