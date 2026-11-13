import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 单文件构建配置
 *
 * 把 JS / CSS 全部内联进一个 index.html，方便直接部署到任意静态目录。
 * 注意：手部识别的 WASM 与模型体积过大（约 42 MB），无法内联，
 * 仍以静态资源形式放在同级的 mediapipe/ 与 models/ 目录中。
 */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    outDir: 'dist-single',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
