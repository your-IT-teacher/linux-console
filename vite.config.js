import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from './package.json' assert { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    // Корень проекта – папка src (где лежит index.html)
    root: 'src',
    
    define: {
        // Подставляем версию из package.json
        'APP_VERSION': JSON.stringify(pkg.version)
    },
    
    build: {
        // Сборка в папку dist на уровень выше
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'src/index.html')
            }
        }
    },
    
    // Папка public (данные) копируется в корень dist
    publicDir: 'public'
});