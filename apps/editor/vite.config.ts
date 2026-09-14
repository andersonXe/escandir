import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/*
 * O GitHub Pages de projeto serve em /<repo>/, não na raiz. O caminho vem do
 * ambiente para o mesmo código servir de qualquer lugar — incluindo a raiz de
 * um domínio próprio, que é o que o projeto promete ao dizer que pode mudar
 * de host numa tarde.
 */
const base = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  base,
  plugins: [svelte()],
  resolve: {
    alias: {
      // O motor entra por código-fonte, não por `dist`: um só passo de build,
      // e o editor nunca roda contra uma compilação velha do motor.
      '@escandir/engine': fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
