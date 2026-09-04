import { APP_VERSION, DEFAULT_COURSE, VIDEO_OWNER_ID } from './config.js';
import { debugLog, initDebugToggle } from './logger.js';
import { fetchUserInfo, checkGroupMembership, handleJoinGroup, openExternal, isGroupMember } from './vk-bridge.js';
import { loadProgressFromStorage, saveProgressToStorage, resetProgress } from './storage.js';
import { 
    setProgress, getProgress, ensureLessonProgress, 
    setVideoStatus, getLessonVideoStatus,
    getTaskStatus, setTaskStatus
} from './progress.js';
import { 
    setCurrentLesson as setArticleCurrentLesson, 
    renderArticles, openArticle, nextArticle, 
    updateNextArticleButton, getCurrentArticleIndex, setCurrentArticleIndex,
    loadArticleContent 
} from './articles.js';
import { 
    setCurrentLesson as setTestCurrentLesson, 
    loadTasks, startTest, nextTask, checkAnswer, 
    updateTestButtonVisibility, setCallbacks as setTestCallbacks,
    hideTest, renderTasksProgress
} from './tests.js';
import { 
    renderCourse, updateDoneButtonVisibility, showLessonTitle, hideLessonTitle, 
    setCurrentCourse, setCurrentLesson as setRenderCurrentLesson, 
    setLessonClickCallback, showLessonContainer, hideLessonContainer,
    updateStartTestButtonVisibility
} from './render.js';

// DOM-элементы (кнопки и т.д.)
const backButton = document.getElementById('backButton');
const doneButton = document.getElementById('doneButton');
const resetButton = document.getElementById('resetButton');
const debugToggle = document.getElementById('debugToggle');
const joinGroupButton = document.getElementById('joinGroupButton');
const nextArticleButton = document.getElementById('nextArticleButton');
const startTestButton = document.getElementById('startTestButton');
const checkButton = document.getElementById('checkButton');
const nextTaskButton = document.getElementById('nextTaskButton');
const backButton3 = document.getElementById('backButton3');
const doneButton3 = document.getElementById('doneButton3');
const backButton4 = document.getElementById('backButton4');
const joinFromNotice = document.getElementById('joinFromNotice');
const joinFromTest = document.getElementById('joinFromTest');
const videoWrapper = document.getElementById('videoWrapper');
const videoContainer = document.getElementById('videoContainer');
const articlesContainer = document.getElementById('articlesContainer');
const articleContent = document.getElementById('articleContent');
const testContainer = document.getElementById('testContainer');
const subscriptionRequired = document.getElementById('subscriptionRequired');
const userBlock = document.getElementById('userBlock');
const joinGroupBlock = document.getElementById('joinGroupBlock');
const courseDescription = document.getElementById('courseDescription');
const footerNote = document.querySelector('.footer-note');
const lessonContainer = document.getElementById('lessonContainer');
const stepsContainer = document.getElementById('stepsContainer');

// Состояние
let currentCourse = null;
let currentLesson = null;
let currentLessonIndex = 0;
let progress = {};

// Передаём прогресс в модули
setProgress(progress);

// Настройка колбэков для тестов
setTestCallbacks(
    () => {
        // hideTest callback
        if (currentLesson && currentLesson.videos && currentLesson.videos.length > 0) {
            videoContainer.style.display = 'block';
        }
        if (currentLesson && currentLesson.articles && currentLesson.articles.length > 0) {
            articlesContainer.style.display = 'block';
        }
        updateStartTestButtonVisibility(isGroupMember && currentLesson && currentLesson.tasks && currentLesson.tasks.length > 0);
        renderTasksProgress();
    },
    () => {
        // updateTestButtonVisibility callback
        updateStartTestButtonVisibility(isGroupMember && currentLesson && currentLesson.tasks && currentLesson.tasks.length > 0);
    }
);

// Функция загрузки JSON (экспортируется для других модулей)
export async function loadJSON(url) {
    debugLog(`Загрузка ${url}`, 'info');
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} — ${response.statusText}`);
    }
    return response.json();
}

// ---- Основные функции навигации ----

async function openLesson(lesson, index) {
    try {
        if (typeof ym === 'function') {
            ym(110303584, 'reachGoal', 'step' + lesson.id);
        }

        let lessonData;
        try {
            lessonData = await loadJSON(`data/${DEFAULT_COURSE}/${lesson.file}`);
        } catch (error) {
            debugLog(`Ошибка загрузки JSON урока ${lesson.id}, используем данные из course.json`, 'error');
            lessonData = lesson;
        }

        ensureLessonProgress(lesson.id, lessonData);
        progress = getProgress(); // обновляем ссылку

        currentLesson = lessonData;
        currentLessonIndex = index;
        setRenderCurrentLesson(lessonData);
        setArticleCurrentLesson(lessonData);
        setTestCurrentLesson(lessonData);

        // Показываем название урока
        if (lessonData && lessonData.title) {
            showLessonTitle(lessonData.title);
        } else {
            hideLessonTitle();
        }

        // Скрываем лишние элементы
        userBlock.style.display = 'none';
        joinGroupBlock.style.display = 'none';
        courseDescription.style.display = 'none';
        if (footerNote) footerNote.style.display = 'none';

        showLessonContainer();

        // Загружаем задания
        await loadTasks(lessonData);

        // Видео
        if (lessonData.videos && lessonData.videos.length > 0) {
            videoContainer.style.display = 'block';
            await setVideoStatus(lesson.id, 0, 'studying', () => {
                renderSteps();
            });
            showVideo(lessonData.videos[0]);
        } else {
            videoContainer.style.display = 'none';
        }

        // Статьи
        if (lessonData.articles && lessonData.articles.length > 0) {
            renderArticles(lessonData, false, (idx, fromRender) => {
                openArticle(idx, fromRender);
            });
        } else {
            articlesContainer.style.display = 'none';
        }

        // Тесты
        testContainer.style.display = 'none';
        if (subscriptionRequired) subscriptionRequired.style.display = 'none';
        updateStartTestButtonVisibility(isGroupMember && lessonData.tasks && lessonData.tasks.length > 0);

        updateDoneButtonVisibility();
    } catch (error) {
        debugLog(`Ошибка открытия урока ${lesson.id}: ${error.message}`, 'error');
        alert('Не удалось загрузить урок. Попробуйте позже.');
    }
}

function showVideo(video) {
    const videoId = video.videoId;
    const hash = video.hash;
    if (!videoId || !hash) {
        debugLog('Нет videoId или hash для видео', 'error');
        return;
    }
    const iframeSrc = `https://vk.com/video_ext.php?oid=${VIDEO_OWNER_ID}&id=${videoId}&hash=${hash}&hd=4&autoplay=1`;
    videoWrapper.innerHTML = `
        <iframe src="${iframeSrc}" 
                width="100%" 
                height="400" 
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;" 
                frameborder="0" 
                allowfullscreen>
        </iframe>
    `;
    debugLog(`Видео ${videoId} встроено`, 'success');
}

function goBack() {
    hideLessonContainer();
    videoWrapper.innerHTML = '';
    videoContainer.style.display = 'none';
    articlesContainer.style.display = 'none';
    articleContent.innerHTML = '';
    testContainer.style.display = 'none';
    if (subscriptionRequired) subscriptionRequired.style.display = 'none';
    currentLesson = null;
    setRenderCurrentLesson(null);
    setArticleCurrentLesson(null);
    setTestCurrentLesson(null);
    doneButton.style.display = 'none';
    if (doneButton3) doneButton3.style.display = 'none';
    startTestButton.style.display = 'none';
    hideLessonTitle();

    userBlock.style.display = '';
    joinGroupBlock.style.display = '';
    courseDescription.style.display = '';
    if (footerNote) footerNote.style.display = '';

    if (currentCourse) {
        document.getElementById('courseTitle').textContent = currentCourse.title;
    }

    debugLog('Возврат к списку', 'info');
}

async function markAsDone() {
    if (!currentLesson) return;

    const lessonId = currentLesson.id;
    if (currentLesson.articles && currentLesson.articles.length > 0) {
        const allRead = progress[lessonId].articles.every(s => s === 'read');
        if (!allRead) {
            const confirmMsg = 'Вы ещё не прочитали все статьи этого урока. Отметить урок как завершённый?';
            if (!confirm(confirmMsg)) {
                return;
            }
        }
    }

    if (currentLesson.tasks && currentLesson.tasks.length > 0) {
        const allPassed = progress[lessonId].tasks.every(s => s === 'passed');
        if (!allPassed) {
            const confirmMsg = 'Вы ещё не прошли все задания этого урока. Отметить урок как завершённый?';
            if (!confirm(confirmMsg)) {
                return;
            }
        }
    }

    if (currentLesson.videos && currentLesson.videos.length > 0) {
        await setVideoStatus(lessonId, 0, 'done', () => {
            renderSteps();
        });
    }

    const nextIndex = currentLessonIndex + 1;
    if (nextIndex < currentCourse.lessons.length) {
        const nextLesson = currentCourse.lessons[nextIndex];
        await openLesson(nextLesson, nextIndex);
    } else {
        debugLog('Все уроки пройдены!', 'success');
        alert('🎉 Поздравляем! Вы завершили все уроки курса!');
        goBack();
    }
}

// ---- Инициализация ----
async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true') {
        document.getElementById('debugInfo').classList.add('show');
        debugLog('Отладка включена через параметр debug=true');
    }

    debugLog(`Приложение загружено, версия ${APP_VERSION}`);

    // Инициализация VK Bridge
    if (window.vkBridge && typeof window.vkBridge.send === 'function') {
        try {
            await window.vkBridge.send('VKWebAppInit');
            debugLog('VK Mini App инициализирован', 'success');
        } catch (err) {
            debugLog(`Ошибка инициализации: ${err.error_type}`, 'error');
        }
    } else {
        debugLog('Bridge не найден, работаем как веб-приложение', 'warn');
    }

    await fetchUserInfo();
    await checkGroupMembership();

    try {
        const courseData = await loadJSON(`data/${DEFAULT_COURSE}/course.json`);
        currentCourse = courseData;
        setCurrentCourse(courseData);

        progress = await loadProgressFromStorage();
        setProgress(progress);

        for (const lesson of courseData.lessons) {
            ensureLessonProgress(lesson.id, null);
        }

        renderCourse(courseData);
    } catch (error) {
        debugLog(`Не удалось загрузить курс: ${error.message}`, 'error');
        document.getElementById('courseTitle').textContent = 'Ошибка загрузки';
        document.getElementById('courseDescription').textContent = 'Не удалось загрузить курс. Проверьте подключение.';
    }

    // Настройка колбэка для кликов по урокам
    setLessonClickCallback((lesson, index) => {
        openLesson(lesson, index);
    });

    // Обработчики событий
    backButton.addEventListener('click', goBack);
    doneButton.addEventListener('click', markAsDone);
    resetButton.addEventListener('click', () => {
        resetProgress(currentCourse, (newProgress) => {
            progress = newProgress;
            setProgress(progress);
            renderSteps();
        });
    });
    joinGroupButton.addEventListener('click', handleJoinGroup);
    nextArticleButton.addEventListener('click', () => {
        nextArticle(() => {
            updateDoneButtonVisibility();
        });
    });

    if (backButton3) backButton3.addEventListener('click', goBack);
    if (doneButton3) doneButton3.addEventListener('click', markAsDone);
    if (backButton4) backButton4.addEventListener('click', goBack);

    if (joinFromNotice) joinFromNotice.addEventListener('click', handleJoinGroup);
    if (joinFromTest) joinFromTest.addEventListener('click', handleJoinGroup);

    startTestButton.addEventListener('click', startTest);
    checkButton.addEventListener('click', checkAnswer);
    nextTaskButton.addEventListener('click', nextTask);

    // Инициализация отладки
    initDebugToggle(debugToggle);
}

// Запуск
init();