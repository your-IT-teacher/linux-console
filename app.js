(function() {
    'use strict';

    // ---- Конфигурация ----
    const DEFAULT_COURSE = 'linux-console'; // идентификатор курса

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
    const debugToggle = document.getElementById('debugToggle');
    const debugInfo = document.getElementById('debugInfo');

    const vkBridge = window.vkBridge;

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

    // ---- Вспомогательные функции для открытия ссылок (запасной вариант) ----
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

    // ---- Работа с VK Bridge (открытие внешних ссылок) ----
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

    // ---- Загрузка JSON ----
    async function loadJSON(url) {
        debugLog(`Загрузка ${url}`, 'info');
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} — ${response.statusText}`);
        }
        return response.json();
    }

    // ---- Получение информации о пользователе VK ----
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

    // ---- Отображение курса ----
    function renderCourse(course) {
        courseTitle.textContent = course.title;
        courseDescription.textContent = course.description;

        stepsContainer.innerHTML = '';
        course.lessons.forEach((lesson, index) => {
            const btn = document.createElement('div');
            btn.className = 'step-button';
            btn.setAttribute('role', 'button');
            btn.setAttribute('tabindex', '0');

            const numberSpan = document.createElement('span');
            numberSpan.className = 'step-number';
            numberSpan.textContent = (index + 1) + '.';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'step-title';
            titleSpan.textContent = lesson.title;

            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'step-arrow';
            arrowSpan.textContent = '›';

            btn.appendChild(numberSpan);
            btn.appendChild(titleSpan);
            btn.appendChild(arrowSpan);

            btn.addEventListener('click', function(e) {
                e.preventDefault();
                openLesson(lesson);
            });
            btn.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openLesson(lesson);
                }
            });

            stepsContainer.appendChild(btn);
        });

        debugLog(`Курс "${course.title}" загружен, уроков: ${course.lessons.length}`, 'success');
    }

    // ---- Открытие урока ----
    async function openLesson(lesson) {
        try {
            // Отправляем метрику
            if (typeof ym === 'function') {
                ym(110303584, 'reachGoal', 'step' + lesson.id);
            }

            // Загружаем детали урока из JSON
            const lessonData = await loadJSON(`data/${DEFAULT_COURSE}/${lesson.file}`);
            showVideo(lessonData);
            debugLog(`Урок ${lesson.id} загружен`, 'success');
        } catch (error) {
            debugLog(`Ошибка загрузки урока ${lesson.id}: ${error.message}`, 'error');
            // Если не удалось загрузить JSON, пробуем использовать данные из course (videoId, hash)
            if (lesson.videoId && lesson.hash) {
                showVideo(lesson);
                debugLog(`Использованы данные из course.json для урока ${lesson.id}`, 'warn');
            } else {
                alert('Не удалось загрузить урок. Попробуйте позже.');
            }
        }
    }

    // ---- Показ видео (виджет VK) ----
    function showVideo(lesson) {
        const ownerId = -193665099; // ID сообщества
        const videoId = lesson.videoId;
        const hash = lesson.hash;
        if (!videoId || !hash) {
            debugLog('Нет videoId или hash для урока', 'error');
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
        debugLog(`Видео ${lesson.id} встроено`, 'success');
    }

    // ---- Возврат к списку ----
    function goBack() {
        videoContainer.style.display = 'none';
        stepsContainer.style.display = 'flex';
        videoWrapper.innerHTML = '';
        debugLog('Возврат к списку', 'info');
    }

    backButton.addEventListener('click', goBack);

    // ---- Инициализация приложения ----
    async function init() {
        // Проверка параметров отладки
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === 'true') {
            debugInfo.classList.add('show');
            debugLog('Отладка включена через параметр debug=true');
        }

        debugLog('Приложение загружено, версия 2.1.0');

        // Инициализация VK Bridge
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

        // Получаем данные пользователя
        await fetchUserInfo();

        // Загружаем курс
        try {
            const courseData = await loadJSON(`data/${DEFAULT_COURSE}/course.json`);
            renderCourse(courseData);
        } catch (error) {
            debugLog(`Не удалось загрузить курс: ${error.message}`, 'error');
            courseTitle.textContent = 'Ошибка загрузки';
            courseDescription.textContent = 'Не удалось загрузить курс. Проверьте подключение.';
        }
    }

    // Запуск
    init();
})();