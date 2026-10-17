import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 8192,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 2048,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },
  esbuild: {
    legalComments: 'none',
    drop: ['debugger'],
    pure: ['console.debug'],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
