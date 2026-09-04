import { DEFAULT_COURSE, STORAGE_PREFIX } from './config.js';
import { debugLog } from './logger.js';

const vkBridge = window.vkBridge;

export function getStorageKey() {
    return STORAGE_PREFIX + DEFAULT_COURSE;
}

export async function saveProgressToStorage(progressData) {
    const key = getStorageKey();
    const value = JSON.stringify(progressData);
    debugLog(`Сохранение прогресса: ключ = ${key}`, 'info');

    if (vkBridge && typeof vkBridge.send === 'function') {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key, value });
            debugLog('Прогресс сохранён в VK Storage', 'success');
        } catch (err) {
            debugLog(`Ошибка сохранения в VK Storage: ${err.error_type}`, 'error');
            try {
                localStorage.setItem(key, value);
                debugLog('Прогресс сохранён в localStorage (fallback)', 'warn');
            } catch (e) {
                debugLog(`Ошибка сохранения в localStorage: ${e.message}`, 'error');
            }
        }
    } else {
        try {
            localStorage.setItem(key, value);
            debugLog('Прогресс сохранён в localStorage', 'warn');
        } catch (e) {
            debugLog(`Ошибка сохранения в localStorage: ${e.message}`, 'error');
        }
    }
}

export async function loadProgressFromStorage() {
    const key = getStorageKey();
    debugLog(`Загрузка прогресса: ключ = ${key}`, 'info');

    if (vkBridge && typeof vkBridge.send === 'function') {
        try {
            const data = await vkBridge.send('VKWebAppStorageGet', { keys: [key] });
            if (data && data.keys && Array.isArray(data.keys)) {
                const found = data.keys.find(item => item.key === key);
                if (found && found.value) {
                    const parsed = JSON.parse(found.value);
                    debugLog('Прогресс загружен из VK Storage', 'success');
                    return parsed;
                }
            }
        } catch (err) {
            debugLog(`Ошибка загрузки из VK Storage: ${err.error_type}`, 'error');
        }
    }

    try {
        const localData = localStorage.getItem(key);
        if (localData) {
            const parsed = JSON.parse(localData);
            debugLog('Прогресс загружен из localStorage (fallback)', 'warn');
            return parsed;
        }
    } catch (e) {
        debugLog(`Ошибка загрузки из localStorage: ${e.message}`, 'error');
    }

    debugLog('Прогресс не найден, возвращаем пустой объект', 'warn');
    return {};
}

export async function resetProgress(currentCourse, callbackAfterReset) {
    const confirmed = confirm('Вы уверены, что хотите сбросить весь прогресс курса? Это действие нельзя отменить.');
    if (!confirmed) return;

    const key = getStorageKey();
    debugLog('Сброс прогресса', 'info');

    if (vkBridge && typeof vkBridge.send === 'function') {
        try {
            await vkBridge.send('VKWebAppStorageSet', { key, value: '' });
            debugLog('Ключ очищен в VK Storage', 'success');
        } catch (err) {
            debugLog(`Ошибка очистки VK Storage: ${err.error_type}`, 'error');
        }
    }

    try {
        localStorage.removeItem(key);
        debugLog('Ключ удалён из localStorage', 'success');
    } catch (e) {
        debugLog(`Ошибка удаления из localStorage: ${e.message}`, 'error');
    }

    // Создаём пустой прогресс
    const newProgress = {};
    if (currentCourse) {
        for (const lesson of currentCourse.lessons) {
            newProgress[lesson.id] = { videos: [], articles: [], tasks: [] };
        }
    }
    await saveProgressToStorage(newProgress);
    if (callbackAfterReset) callbackAfterReset(newProgress);
    debugLog('Прогресс сброшен', 'success');
    alert('Прогресс курса сброшен. Вы можете начать обучение заново.');
}