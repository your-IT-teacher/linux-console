import { saveProgressToStorage } from './storage.js';
import { debugLog } from './logger.js';

let progress = {};

export function setProgress(p) {
    progress = p;
}

export function getProgress() {
    return progress;
}

// Инициализация прогресса для урока
export function ensureLessonProgress(lessonId, lessonData) {
    if (!progress[lessonId]) {
        progress[lessonId] = { videos: [], articles: [], tasks: [] };
    }
    if (typeof progress[lessonId] === 'string') {
        const oldStatus = progress[lessonId];
        progress[lessonId] = {
            videos: [oldStatus === 'done' ? 'done' : 'not_started'],
            articles: [],
            tasks: []
        };
    }
    ['videos', 'articles', 'tasks'].forEach(type => {
        if (!Array.isArray(progress[lessonId][type])) {
            progress[lessonId][type] = [];
        }
    });
    if (lessonData) {
        const videoCount = (lessonData.videos || []).length;
        const articleCount = (lessonData.articles || []).length;
        const taskCount = (lessonData.tasks || []).length;
        while (progress[lessonId].videos.length < videoCount) {
            progress[lessonId].videos.push('not_started');
        }
        while (progress[lessonId].articles.length < articleCount) {
            progress[lessonId].articles.push('not_started');
        }
        while (progress[lessonId].tasks.length < taskCount) {
            progress[lessonId].tasks.push('not_started');
        }
    }
}

// Статусы видео
export function getLessonVideoStatus(lessonId) {
    const p = progress[lessonId];
    if (!p || !p.videos || p.videos.length === 0) return 'not_started';
    if (p.videos.includes('studying')) return 'studying';
    if (p.videos.every(s => s === 'done')) return 'done';
    return 'not_started';
}

export async function setVideoStatus(lessonId, videoIndex, status, callbackAfterSave) {
    ensureLessonProgress(lessonId);
    if (videoIndex < 0 || videoIndex >= progress[lessonId].videos.length) {
        debugLog(`Ошибка: индекс видео ${videoIndex} вне диапазона`, 'error');
        return;
    }
    progress[lessonId].videos[videoIndex] = status;
    await saveProgressToStorage(progress);
    if (callbackAfterSave) callbackAfterSave();
}

// Статусы статей
export function getArticleStatus(lessonId, articleIndex) {
    const p = progress[lessonId];
    if (!p || !p.articles || articleIndex >= p.articles.length) {
        return 'not_started';
    }
    return p.articles[articleIndex] || 'not_started';
}

export async function setArticleStatus(lessonId, articleIndex, status, callbackAfterSave) {
    ensureLessonProgress(lessonId);
    if (articleIndex < 0 || articleIndex >= progress[lessonId].articles.length) {
        debugLog(`Ошибка: индекс статьи ${articleIndex} вне диапазона`, 'error');
        return;
    }
    progress[lessonId].articles[articleIndex] = status;
    await saveProgressToStorage(progress);
    if (callbackAfterSave) callbackAfterSave();
}

// Статусы заданий (тестов)
export function getTaskStatus(lessonId, taskIndex) {
    const p = progress[lessonId];
    if (!p || !p.tasks || taskIndex >= p.tasks.length) {
        return 'not_started';
    }
    return p.tasks[taskIndex] || 'not_started';
}

export async function setTaskStatus(lessonId, taskIndex, status, callbackAfterSave) {
    ensureLessonProgress(lessonId);
    if (taskIndex < 0 || taskIndex >= progress[lessonId].tasks.length) {
        debugLog(`Ошибка: индекс задания ${taskIndex} вне диапазона`, 'error');
        return;
    }
    progress[lessonId].tasks[taskIndex] = status;
    await saveProgressToStorage(progress);
    if (callbackAfterSave) callbackAfterSave();
}