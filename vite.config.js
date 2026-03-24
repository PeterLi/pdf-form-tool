import { defineConfig } from 'vite';

export default defineConfig({
  // Exclude pdfjs-dist from Vite's pre-bundling so its worker URL
  // is resolved correctly at runtime via import.meta.url
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  server: {
    port: 5173,
    open: true,
  },
});
