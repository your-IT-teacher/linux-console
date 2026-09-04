import { DEFAULT_COURSE } from './config.js';
import { debugLog } from './logger.js';
import { getArticleStatus, setArticleStatus } from './progress.js';
import { loadJSON } from './main.js'; // будет экспортировано из main

// DOM-элементы
const articlesContainer = document.getElementById('articlesContainer');
const articlesList = document.getElementById('articlesList');
const articleContent = document.getElementById('articleContent');
const nextArticleButton = document.getElementById('nextArticleButton');

let currentLesson = null;
let currentArticleIndex = 0;
let articleCache = {};

export function setCurrentLesson(lesson) {
    currentLesson = lesson;
}

export function getCurrentArticleIndex() {
    return currentArticleIndex;
}

export function setCurrentArticleIndex(index) {
    currentArticleIndex = index;
}

export async function loadArticleContent(article) {
    if (articleCache[article.id]) return articleCache[article.id];
    try {
        const data = await loadJSON(`data/${DEFAULT_COURSE}/lessons/${currentLesson.id}/${article.file}`);
        if (data && data.content) {
            articleCache[article.id] = data.content;
            return data.content;
        }
    } catch (error) {
        debugLog(`Ошибка загрузки статьи ${article.id}: ${error.message}`, 'error');
    }
    return '<p>Не удалось загрузить статью. Попробуйте позже.</p>';
}

export function renderArticles(lessonData, skipOpen = false, openArticleFn) {
    if (!lessonData || !lessonData.articles || lessonData.articles.length === 0) {
        articlesContainer.style.display = 'none';
        return;
    }
    articlesContainer.style.display = 'block';

    const articles = lessonData.articles;
    const lessonId = lessonData.id;

    let html = '';
    articles.forEach((article, index) => {
        const status = getArticleStatus(lessonId, index);
        let statusIcon = '🔵';
        let statusClass = 'status-not_started';
        if (status === 'studying') {
            statusIcon = '📖';
            statusClass = 'status-studying';
        } else if (status === 'read') {
            statusIcon = '✅';
            statusClass = 'status-read';
        }
        html += `
            <div class="article-item ${statusClass}" data-index="${index}">
                <span class="article-status">${statusIcon}</span>
                <span class="article-title">${article.title}</span>
            </div>
        `;
    });
    articlesList.innerHTML = html;

    document.querySelectorAll('.article-item').forEach(el => {
        el.addEventListener('click', function() {
            const index = parseInt(this.dataset.index);
            if (openArticleFn) openArticleFn(index);
        });
    });

    if (!skipOpen) {
        let targetIndex = 0;
        let studyingIndex = -1;
        let notStartedIndex = -1;
        for (let i = 0; i < articles.length; i++) {
            const status = getArticleStatus(lessonId, i);
            if (status === 'studying') {
                studyingIndex = i;
                break;
            }
            if (status === 'not_started' && notStartedIndex === -1) {
                notStartedIndex = i;
            }
        }
        if (studyingIndex !== -1) {
            targetIndex = studyingIndex;
        } else if (notStartedIndex !== -1) {
            targetIndex = notStartedIndex;
        } else {
            targetIndex = articles.length - 1;
        }
        currentArticleIndex = targetIndex;
        if (openArticleFn) openArticleFn(targetIndex, true);
    }

    updateNextArticleButton();
}

export function updateNextArticleButton() {
    if (!currentLesson || !currentLesson.articles) {
        nextArticleButton.style.display = 'none';
        return;
    }
    const articles = currentLesson.articles;
    const nextIndex = currentArticleIndex + 1;
    if (nextIndex < articles.length) {
        nextArticleButton.style.display = 'inline-block';
        nextArticleButton.disabled = false;
        nextArticleButton.textContent = `➡️ Следующая статья (${nextIndex+1}/${articles.length})`;
    } else {
        nextArticleButton.style.display = 'inline-block';
        nextArticleButton.disabled = true;
        nextArticleButton.textContent = '✅ Все статьи изучены';
    }
}

export async function openArticle(index, fromRender = false, onArticleOpened) {
    if (!currentLesson) return;
    const articles = currentLesson.articles;
    if (!articles || index < 0 || index >= articles.length) return;

    currentArticleIndex = index;
    const article = articles[index];
    const lessonId = currentLesson.id;

    await setArticleStatus(lessonId, index, 'studying', () => {
        // после сохранения статуса
    });

    articleContent.innerHTML = '<div style="text-align:center;padding:20px;">⏳ Загрузка статьи...</div>';

    const content = await loadArticleContent(article);
    articleContent.innerHTML = content;

    if (!fromRender) {
        renderArticles(currentLesson, true, openArticle);
    } else {
        renderArticles(currentLesson, true, openArticle);
    }
    updateNextArticleButton();
    if (onArticleOpened) onArticleOpened();
}

export async function nextArticle(onArticleOpened) {
    if (!currentLesson || !currentLesson.articles) return;
    const articles = currentLesson.articles;
    const lessonId = currentLesson.id;

    await setArticleStatus(lessonId, currentArticleIndex, 'read', () => {});

    const nextIndex = currentArticleIndex + 1;
    if (nextIndex < articles.length) {
        await openArticle(nextIndex, false, onArticleOpened);
    } else {
        nextArticleButton.disabled = true;
        nextArticleButton.textContent = '✅ Все статьи изучены';
        articleContent.innerHTML += '<p style="color:green;font-weight:bold;">🎉 Поздравляем! Вы изучили все статьи этого урока.</p>';
        renderArticles(currentLesson, true, openArticle);
        if (onArticleOpened) onArticleOpened();
    }
}