// vite.config.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import pkg from './package.json' assert { type: 'json' };

export default defineConfig({
    root: '.',
    define: {
        'APP_VERSION': JSON.stringify(pkg.version)
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    },
    // Если data лежит в public, то publicDir по умолчанию 'public'
    // Если data в корне, можно настроить алиас или использовать плагин copy
    // Для простоты предполагаем, что data лежит в public/data
    publicDir: 'public'
});