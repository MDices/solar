// Configuração do Vite para o projeto Solar.
// - Build estático para deploy na Vercel (saída em dist/).
// - Shaders GLSL são importados como string via sufixo `?raw` (recurso nativo do Vite),
//   portanto NÃO precisamos de plugin extra de GLSL.
// - Configuração do Vitest para os testes unitários (funções puras).
import { defineConfig } from 'vite';

export default defineConfig({
  // Caminho relativo garante que os assets funcionem sob qualquer subpath (ex.: is-a.dev).
  base: './',

  build: {
    outDir: 'dist',
    // Alvo moderno: usamos WebGL2 / ES modules de qualquer forma.
    target: 'es2020',
    sourcemap: false,
  },

  // Configuração dos testes unitários (Vitest).
  test: {
    environment: 'node',
    include: ['test/**/*.{test,spec}.js', 'src/**/*.{test,spec}.js'],
  },
});
