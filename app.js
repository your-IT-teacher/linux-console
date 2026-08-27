(function() {
    'use strict';

    // ---- Конфигурация ----
    const DEFAULT_COURSE = 'linux-console';
    const STORAGE_PREFIX = 'course_progress_';

    // ---- DOM-элементы ----
    const userBlock = document.getElementById('userBlock');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const courseTitle = document.getElementById('courseTitle');
    const courseDescription = document.getElementById('courseDescription');
    const stepsContainer = document.getElementById('stepsContainer');
    const videoContainer = document.getElementById('videoContainer');
    const videoWrapper = document.getElementById('videoWrapper');
    const backButton = document.getElementById('backButton');
    const doneButton = document.getElementById('doneButton');
    const debugToggle = document.getElementById('debugToggle');
    const debugInfo = document.getElementById('debugInfo');

    const vkBridge = window.vkBridge;

    // ---- Состояние ----
    let currentCourse = null;
    let currentLesson = null;
    let currentLessonIndex = 0;
    let progress = {};

    // ---- Логгер ----
    function debugLog(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `debug-entry ${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        debugInfo.appendChild(entry);
        debugInfo.scrollTop = debugInfo.scrollHeight;
        console.log(`[DEBUG] ${message}`);
    }

    // ---- Переключение отладки ----
    debugToggle.addEventListener('click', function(e) {
        e.preventDefault();
        debugInfo.classList.toggle('show');
        if (debugInfo.classList.contains('show')) {
            debugLog('Отладка включена');
        }
    });

    // ---- Вспомогательные функции для открытия ссылок ----
    function fallbackOpen(url) {
        try {
            const win = window.open(url, '_blank');
            if (!win || win.closed || typeof win.closed === 'undefined') {
                window.location.href = url;
            }
        } catch (e) {
            window.location.href = url;
        }
    }

    function openExternal(url) {
        if (vkBridge && typeof vkBridge.send === 'function') {
            let resolved = false;
            const promise = vkBridge.send('VKWebAppOpenExternal', { url });
            const timeout = new Promise((resolve) => {
                setTimeout(() => { if (!resolved) resolve('timeout'); }, 3000);
            });
            Promise.race([promise, timeout])
                .then((result) => {
                    if (result === 'timeout') {
                        debugLog('VKWebAppOpenExternal не ответил, fallback', 'warn');
                        fallbackOpen(url);
                    } else {
                        resolved = true;
                        debugLog('VKWebAppOpenExternal успешно', 'success');
                    }
                })
                .catch((err) => {
                    resolved = true;
                    debugLog(`Ошибка VKWebAppOpenExternal: ${err.error_type}`, 'error');
                    fallbackOpen(url);
                });
        } else {
            debugLog('Bridge не доступен, fallback', 'warn');
            fallbackOpen(url);
        }
    }

    // ---- Работа с хранилищем (VK Storage + localStorage fallback) ----
    function getStorageKey() {
        return STORAGE_PREFIX + DEFAULT_COURSE;
    }

    async function saveProgressToStorage(progressData) {
        const key = getStorageKey();
        const value = JSON.stringify(progressData);
        debugLog(`Сохранение прогресса: ключ = ${key}`, 'info');
        debugLog(`Данные для сохранения: ${value}`, 'info');

        if (vkBridge && typeof vkBridge.send === 'function') {
            try {
                const response = await vkBridge.send('VKWebAppStorageSet', { key, value });
                debugLog(`Ответ VK Storage Set: ${JSON.stringify(response)}`, 'info');
                debugLog('Прогресс сохранён в VK Storage', 'success');
                await checkStorageValue(key);
            } catch (err) {
                debugLog(`Ошибка сохранения в VK Storage: ${err.error_type}`, 'error');
                debugLog(`Детали: ${JSON.stringify(err)}`, 'error');
                try {
                    localStorage.setItem(key, value);
                    debugLog('Прогресс сохранён в localStorage (fallback)', 'warn');
                    const saved = localStorage.getItem(key);
                    debugLog(`Проверка localStorage: ${saved}`, 'info');
                } catch (e) {
                    debugLog(`Ошибка сохранения в localStorage: ${e.message}`, 'error');
                }
            }
        } else {
            try {
                localStorage.setItem(key, value);
                debugLog('Прогресс сохранён в localStorage', 'warn');
                const saved = localStorage.getItem(key);
                debugLog(`Проверка localStorage: ${saved}`, 'info');
            } catch (e) {
                debugLog(`Ошибка сохранения в localStorage: ${e.message}`, 'error');
            }
        }
    }

    async function checkStorageValue(key) {
        if (vkBridge && typeof vkBridge.send === 'function') {
            try {
                const data = await vkBridge.send('VKWebAppStorageGet', { keys: [key] });
                debugLog(`Результат проверки VK Storage для ключа ${key}: ${JSON.stringify(data)}`, 'info');
                if (data && data.keys && data.keys[key]) {
                    debugLog(`Значение в VK Storage: ${data.keys[key]}`, 'success');
                } else {
                    debugLog('В VK Storage нет данных по ключу (после сохранения!)', 'warn');
                }
            } catch (err) {
                debugLog(`Ошибка проверки VK Storage: ${err.error_type}`, 'error');
            }
        }
    }

    async function loadProgressFromStorage() {
        const key = getStorageKey();
        debugLog(`Загрузка прогресса: ключ = ${key}`, 'info');

        if (vkBridge && typeof vkBridge.send === 'function') {
            try {
                const data = await vkBridge.send('VKWebAppStorageGet', { keys: [key] });
                debugLog(`Ответ VK Storage Get: ${JSON.stringify(data)}`, 'info');
                if (data && data.keys && data.keys[key]) {
                    const parsed = JSON.parse(data.keys[key]);
                    debugLog(`Прогресс загружен из VK Storage: ${JSON.stringify(parsed)}`, 'success');
                    return parsed;
                } else {
                    debugLog('В VK Storage нет данных по ключу', 'warn');
                }
            } catch (err) {
                debugLog(`Ошибка загрузки из VK Storage: ${err.error_type}`, 'error');
                debugLog(`Детали: ${JSON.stringify(err)}`, 'error');
            }
        }

        try {
            const localData = localStorage.getItem(key);
            debugLog(`Проверка localStorage: ${localData}`, 'info');
            if (localData) {
                const parsed = JSON.parse(localData);
                debugLog(`Прогресс загружен из localStorage (fallback): ${JSON.stringify(parsed)}`, 'warn');
                return parsed;
            } else {
                debugLog('В localStorage нет данных по ключу', 'warn');
            }
        } catch (e) {
            debugLog(`Ошибка загрузки из localStorage: ${e.message}`, 'error');
        }

        debugLog('Прогресс не найден, возвращаем пустой объект', 'warn');
        return {};
    }

    // ---- Инициализация прогресса для урока на основе данных ----
    function ensureLessonProgress(lessonId, lessonData) {
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

    // ---- Получение общего статуса видео для отображения в списке ----
    function getLessonVideoStatus(lessonId) {
        const p = progress[lessonId];
        if (!p || !p.videos || p.videos.length === 0) return 'not_started';
        if (p.videos.includes('studying')) return 'studying';
        if (p.videos.every(s => s === 'done')) return 'done';
        return 'not_started';
    }

    // ---- Установка статуса конкретного видео ----
    async function setVideoStatus(lessonId, videoIndex, status) {
        ensureLessonProgress(lessonId);
        if (videoIndex < 0 || videoIndex >= progress[lessonId].videos.length) {
            debugLog(`Ошибка: индекс видео ${videoIndex} вне диапазона`, 'error');
            return;
        }
        progress[lessonId].videos[videoIndex] = status;
        await saveProgressToStorage(progress);
        renderSteps();
    }

    // ---- Загрузка JSON ----
    async function loadJSON(url) {
        debugLog(`Загрузка ${url}`, 'info');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} — ${response.statusText}`);
        }
        return response.json();
    }

    // ---- Получение информации о пользователе ----
    async function fetchUserInfo() {
        try {
            if (!vkBridge || typeof vkBridge.send !== 'function') {
                userBlock.style.display = 'flex';
                userName.textContent = 'Гость (без VK)';
                userAvatar.src =
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"%3E%3Ccircle cx="20" cy="20" r="20" fill="%23e1e4e8"/%3E%3Ctext x="20" y="26" font-size="16" text-anchor="middle" fill="%238e8e93"%3E?%3C/text%3E%3C/svg%3E';
                return;
            }
            const data = await vkBridge.send('VKWebAppGetUserInfo');
            if (data && data.first_name) {
                userBlock.style.display = 'flex';
                userName.textContent = data.first_name + (data.last_name ? ' ' + data.last_name : '');
                userAvatar.src = data.photo_200 ||
                    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"%3E%3Ccircle cx="20" cy="20" r="20" fill="%23e1e4e8"/%3E%3Ctext x="20" y="26" font-size="16" text-anchor="middle" fill="%238e8e93"%3E?%3C/text%3E%3C/svg%3E';
            } else {
                userBlock.style.display = 'flex';
                userName.textContent = 'Пользователь VK';
            }
        } catch (error) {
            debugLog(`Ошибка получения пользователя: ${error.message}`, 'error');
            userBlock.style.display = 'flex';
            userName.textContent = 'Гость (ошибка VK)';
        }
    }

    // ---- Отображение списка уроков ----
    function renderSteps() {
        if (!currentCourse) return;

        stepsContainer.innerHTML = '';
        currentCourse.lessons.forEach((lesson, index) => {
            const btn = document.createElement('div');
            btn.className = 'step-button';

            const status = getLessonVideoStatus(lesson.id);
            if (status === 'studying') btn.classList.add('status-studying');
            else if (status === 'done') btn.classList.add('status-done');

            btn.setAttribute('role', 'button');
            btn.setAttribute('tabindex', '0');

            const numberSpan = document.createElement('span');
            numberSpan.className = 'step-number';
            numberSpan.textContent = (index + 1) + '.';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'step-title';
            titleSpan.textContent = lesson.title;

            const statusSpan = document.createElement('span');
            statusSpan.className = 'step-status';
            if (status === 'studying') statusSpan.textContent = '📖';
            else if (status === 'done') statusSpan.textContent = '✅';

            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'step-arrow';
            arrowSpan.textContent = '›';

            btn.appendChild(numberSpan);
            btn.appendChild(titleSpan);
            btn.appendChild(statusSpan);
            btn.appendChild(arrowSpan);

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                openLesson(lesson, index);
            });
            btn.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLesson(lesson, index);
                }
            });

            stepsContainer.appendChild(btn);
        });

        updateDoneButtonVisibility();
    }

    // ---- Открытие урока ----
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

            currentLesson = lessonData;
            currentLessonIndex = index;

            if (lessonData.videos && lessonData.videos.length > 0) {
                await setVideoStatus(lesson.id, 0, 'studying');
                showVideo(lessonData.videos[0]);
            } else {
                debugLog('В уроке нет видео', 'warn');
                alert('В этом уроке пока нет видео.');
            }

            updateDoneButtonVisibility();
        } catch (error) {
            debugLog(`Ошибка открытия урока ${lesson.id}: ${error.message}`, 'error');
            alert('Не удалось загрузить урок. Попробуйте позже.');
        }
    }

    // ---- Показ видео ----
    function showVideo(video) {
        const ownerId = -193665099;
        const videoId = video.videoId;
        const hash = video.hash;
        if (!videoId || !hash) {
            debugLog('Нет videoId или hash для видео', 'error');
            return;
        }
        const iframeSrc = `https://vk.com/video_ext.php?oid=${ownerId}&id=${videoId}&hash=${hash}&hd=4&autoplay=1`;
        videoWrapper.innerHTML = `
            <iframe src="${iframeSrc}" 
                    width="100%" 
                    height="400" 
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock;" 
                    frameborder="0" 
                    allowfullscreen>
            </iframe>
        `;
        stepsContainer.style.display = 'none';
        videoContainer.style.display = 'block';
        debugLog(`Видео ${videoId} встроено`, 'success');
    }

    // ---- Кнопка "Сделано! Перейти к следующему" ----
    async function markAsDone() {
        if (!currentLesson) return;

        const lessonId = currentLesson.id;
        if (currentLesson.videos && currentLesson.videos.length > 0) {
            await setVideoStatus(lessonId, 0, 'done');
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

    // ---- Обновление видимости кнопки "Сделано" ----
    function updateDoneButtonVisibility() {
        if (currentLesson && videoContainer.style.display === 'block') {
            doneButton.style.display = 'inline-block';
        } else {
            doneButton.style.display = 'none';
        }
    }

    // ---- Возврат к списку ----
    function goBack() {
        videoContainer.style.display = 'none';
        stepsContainer.style.display = 'flex';
        videoWrapper.innerHTML = '';
        currentLesson = null;
        doneButton.style.display = 'none';
        debugLog('Возврат к списку', 'info');
    }

    // ---- Инициализация ----
    async function init() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            debugInfo.classList.add('show');
            debugLog('Отладка включена через параметр debug=true');
        }

        debugLog('Приложение загружено, версия 2.4.0');

        if (vkBridge && typeof vkBridge.send === 'function') {
            try {
                await vkBridge.send('VKWebAppInit');
                debugLog('VK Mini App инициализирован', 'success');
            } catch (err) {
                debugLog(`Ошибка инициализации: ${err.error_type}`, 'error');
            }
        } else {
            debugLog('Bridge не найден, работаем как веб-приложение', 'warn');
        }

        await fetchUserInfo();

        try {
            const courseData = await loadJSON(`data/${DEFAULT_COURSE}/course.json`);
            currentCourse = courseData;

            progress = await loadProgressFromStorage();

            for (const lesson of courseData.lessons) {
                ensureLessonProgress(lesson.id, null);
            }

            renderCourse(courseData);
        } catch (error) {
            debugLog(`Не удалось загрузить курс: ${error.message}`, 'error');
            courseTitle.textContent = 'Ошибка загрузки';
            courseDescription.textContent = 'Не удалось загрузить курс. Проверьте подключение.';
        }

        backButton.addEventListener('click', goBack);
        doneButton.addEventListener('click', markAsDone);
    }

    function renderCourse(course) {
        courseTitle.textContent = course.title;
        courseDescription.textContent = course.description;
        renderSteps();
    }

    init();
})();