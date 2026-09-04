// DOM-элемент для панели отладки
const debugInfo = document.getElementById('debugInfo');

// Логгер: добавляет сообщение в панель отладки и в консоль
export function debugLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `debug-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    debugInfo.appendChild(entry);
    debugInfo.scrollTop = debugInfo.scrollHeight;
    console.log(`[DEBUG] ${message}`);
}

// Переключение видимости панели отладки
export function initDebugToggle(debugToggleElement) {
    debugToggleElement.addEventListener('click', function(e) {
        e.preventDefault();
        debugInfo.classList.toggle('show');
        if (debugInfo.classList.contains('show')) {
            debugLog('Отладка включена');
        }
    });
}