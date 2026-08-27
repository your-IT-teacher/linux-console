(function() {
    'use strict';

    // ---- Версия приложения ----
    const APP_VERSION = '2.7.0';

    // ---- Конфигурация ----
    const DEFAULT_COURSE = 'linux-console';
    const STORAGE_PREFIX = 'course_progress_';
    const GROUP_ID = 193665099;

    // ---- DOM-элементы ----
    const userBlock = document.getElementById('userBlock');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const courseTitle = document.getElementById('courseTitle');
    const courseDescription = document.getElementById('courseDescription');
    const stepsContainer = document.getElementById('stepsContainer');
    const lessonContainer = document.getElementById('lessonContainer');
    const videoContainer = document.getElementById('videoContainer');
    const videoWrapper = document.getElementById('videoWrapper');
    const backButton = document.getElementById('backButton');
    const doneButton = document.getElementById('doneButton');
    const resetButton = document.getElementById('resetButton');
    const debugToggle = document.getElementById('debugToggle');
    const debugInfo = document.getElementById('debugInfo');
    const joinGroupButton = document.getElementById('joinGroupButton');
    const joinGroupStatus = document.getElementById('joinGroupStatus');
    const appVersionSpan = document.getElementById('appVersion');

    const articlesContainer = document.getElementById('articlesContainer');
    const articlesList = document.getElementById('articlesList');
    const articleContent = document.getElementById('articleContent');
    const nextArticleButton = document.getElementById('nextArticleButton');

    const vkBridge = window.vkBridge;

    // ---- Устанавливаем версию ----
    if (appVersionSpan) {
        appVersionSpan.textContent = APP_VERSION;
    }

    // ---- Состояние ----
    let currentCourse = null;
    let currentLesson = null;
    let currentLessonIndex = 0;
    let progress = {};
    let isGroupMember = false;
    let currentArticleIndex = 0;
    let articleCache = {}; // кеш для загруженных статей

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

    // ---- Работа с хранилищем ----
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
                if (data && data.keys && Array.isArray(data.keys)) {
                    const found = data.keys.find(item => item.key === key);
                    if (found && found.value) {
                        debugLog(`Значение в VK Storage: ${found.value}`, 'success');
                    } else {
                        debugLog('В VK Storage нет данных по ключу (после сохранения!)', 'warn');
                    }
                } else {
                    debugLog('Неожиданный формат ответа при проверке', 'warn');
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
                if (data && data.keys && Array.isArray(data.keys)) {
                    const found = data.keys.find(item => item.key === key);
                    if (found && found.value) {
                        const parsed = JSON.parse(found.value);
                        debugLog(`Прогресс загружен из VK Storage: ${JSON.stringify(parsed)}`, 'success');
                        return parsed;
                    } else {
                        debugLog('В VK Storage нет данных по ключу', 'warn');
                    }
                } else {
                    debugLog('Неожиданный формат ответа VK Storage', 'warn');
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

    // ---- Сброс прогресса ----
    async function resetProgress() {
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

        progress = {};
        if (currentCourse) {
            for (const lesson of currentCourse.lessons) {
                progress[lesson.id] = { videos: [], articles: [], tasks: [] };
            }
        }
        await saveProgressToStorage(progress);
        renderSteps();
        debugLog('Прогресс сброшен', 'success');
        alert('Прогресс курса сброшен. Вы можете начать обучение заново.');
    }

    // ---- Проверка членства в группе ----
    async function checkGroupMembership() {
        if (!vkBridge || typeof vkBridge.send !== 'function') {
            joinGroupButton.disabled = true;
            joinGroupButton.textContent = '⚠️ Недоступно';
            joinGroupStatus.textContent = 'Функция доступна только в приложении VK.';
            return;
        }

        try {
            const data = await vkBridge.send('VKWebAppGetGroupInfo', { group_id: GROUP_ID });
            debugLog(`VKWebAppGetGroupInfo ответ (сырой): ${JSON.stringify(data)}`, 'info');

            let isMember = false;
            let found = false;

            if (data && typeof data.is_member !== 'undefined') {
                found = true;
                isMember = data.is_member === 1 || data.is_member === true || data.is_member === '1';
                debugLog(`Нашли is_member на верхнем уровне: ${data.is_member} -> ${isMember}`, 'info');
            }
            if (data && data.group && typeof data.group.is_member !== 'undefined') {
                found = true;
                const val = data.group.is_member;
                isMember = val === 1 || val === true || val === '1';
                debugLog(`Нашли is_member в data.group: ${val} -> ${isMember}`, 'info');
            }
            if (Array.isArray(data) && data.length > 0 && data[0].group && typeof data[0].group.is_member !== 'undefined') {
                found = true;
                const val = data[0].group.is_member;
                isMember = val === 1 || val === true || val === '1';
                debugLog(`Нашли is_member в data[0].group: ${val} -> ${isMember}`, 'info');
            }
            if (data && typeof data.id !== 'undefined' && typeof data.is_member !== 'undefined') {
                found = true;
                isMember = data.is_member === 1 || data.is_member === true || data.is_member === '1';
                debugLog(`Нашли is_member в самом объекте: ${data.is_member} -> ${isMember}`, 'info');
            }

            if (!found) {
                debugLog('Не удалось найти поле is_member ни в одном из вариантов. Структура data:', 'warn');
                if (data && typeof data === 'object') {
                    debugLog(`Ключи data: ${Object.keys(data).join(', ')}`, 'warn');
                    if (data.group) {
                        debugLog(`Ключи data.group: ${Object.keys(data.group).join(', ')}`, 'warn');
                    }
                }
            }

            isGroupMember = isMember;

            if (isGroupMember) {
                joinGroupButton.classList.add('joined');
                joinGroupButton.textContent = '✅ Вы в группе!';
                joinGroupButton.disabled = true;
                joinGroupStatus.textContent = 'Спасибо, что подписались! Вы будете получать уведомления о новых вебинарах.';
                debugLog('Пользователь состоит в группе', 'success');
            } else {
                joinGroupButton.classList.remove('joined');
                joinGroupButton.textContent = '📢 Вступить в группу';
                joinGroupButton.disabled = false;
                joinGroupStatus.textContent = 'Подпишитесь, чтобы не пропустить новые вебинары и получить доступ к закрытому контенту.';
                debugLog('Пользователь не состоит в группе', 'info');
            }
        } catch (error) {
            debugLog(`Ошибка VKWebAppGetGroupInfo: ${error.error_type || error.message}`, 'error');
            debugLog(`Детали ошибки: ${JSON.stringify(error)}`, 'error');
            joinGroupButton.disabled = true;
            joinGroupButton.textContent = '⚠️ Ошибка';
            joinGroupStatus.textContent = 'Не удалось проверить подписку. Попробуйте позже.';
        }
    }

    // ---- Обработчик вступления в группу ----
    async function handleJoinGroup() {
        if (!vkBridge || typeof vkBridge.send !== 'function') {
            joinGroupStatus.textContent = 'Функция доступна только в приложении VK.';
            return;
        }

        if (isGroupMember) {
            joinGroupStatus.textContent = 'Вы уже в группе!';
            return;
        }

        joinGroupButton.disabled = true;
        joinGroupButton.textContent = '⏳ Обработка...';
        joinGroupStatus.textContent = '';

        try {
            const data = await vkBridge.send('VKWebAppJoinGroup', { group_id: GROUP_ID });
            debugLog(`VKWebAppJoinGroup ответ: ${JSON.stringify(data)}`, 'info');
            if (data && data.result) {
                isGroupMember = true;
                joinGroupButton.classList.add('joined');
                joinGroupButton.textContent = '✅ Вы в группе!';
                joinGroupButton.disabled = true;
                joinGroupStatus.textContent = 'Спасибо! Теперь вы будете в курсе новых вебинаров и получите доступ к закрытому контенту.';
                debugLog(`Пользователь вступил в группу ${GROUP_ID}`, 'success');
            } else {
                joinGroupButton.disabled = false;
                joinGroupButton.textContent = '📢 Вступить в группу';
                joinGroupStatus.textContent = 'Не удалось вступить в группу. Попробуйте позже.';
                debugLog('VKWebAppJoinGroup вернул false', 'warn');
            }
        } catch (error) {
            joinGroupButton.disabled = false;
            joinGroupButton.textContent = '📢 Вступить в группу';
            joinGroupStatus.textContent = 'Ошибка при вступлении в группу.';
            debugLog(`Ошибка VKWebAppJoinGroup: ${error.error_type || error.message}`, 'error');
        }
    }

    // ---- Инициализация прогресса для урока ----
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

    // ---- Работа со статусами видео ----
    function getLessonVideoStatus(lessonId) {
        const p = progress[lessonId];
        if (!p || !p.videos || p.videos.length === 0) return 'not_started';
        if (p.videos.includes('studying')) return 'studying';
        if (p.videos.every(s => s === 'done')) return 'done';
        return 'not_started';
    }

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

    // ---- Работа со статьями ----
    function getArticleStatus(lessonId, articleIndex) {
        const p = progress[lessonId];
        if (!p || !p.articles || articleIndex >= p.articles.length) {
            return 'not_started';
        }
        return p.articles[articleIndex] || 'not_started';
    }

    async function setArticleStatus(lessonId, articleIndex, status) {
        ensureLessonProgress(lessonId);
        if (articleIndex < 0 || articleIndex >= progress[lessonId].articles.length) {
            debugLog(`Ошибка: индекс статьи ${articleIndex} вне диапазона`, 'error');
            return;
        }
        progress[lessonId].articles[articleIndex] = status;
        await saveProgressToStorage(progress);
        // Обновляем список, но не перезагружаем содержимое (оно уже отображается)
        renderArticles(currentLesson);
    }

    // ---- Загрузка содержимого статьи (кешируется) ----
    async function loadArticleContent(article) {
        if (articleCache[article.id]) {
            return articleCache[article.id];
        }
        try {
            const data = await loadJSON(`data/${DEFAULT_COURSE}/lessons/${currentLesson.id}/${article.file}`);
            if (data && data.content) {
                articleCache[article.id] = data.content;
                return data.content;
            } else {
                throw new Error('Неверный формат статьи');
            }
        } catch (error) {
            debugLog(`Ошибка загрузки статьи ${article.id}: ${error.message}`, 'error');
            return '<p>Не удалось загрузить статью. Попробуйте позже.</p>';
        }
    }

    // ---- Отрисовка списка статей (без содержимого) ----
    function renderArticles(lessonData) {
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

        // Навешиваем обработчики кликов
        document.querySelectorAll('.article-item').forEach(el => {
            el.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                openArticle(index);
            });
        });

        // Определяем, какую статью показывать: если есть studying, то её, иначе первую не прочитанную, иначе последнюю
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
            // все прочитаны, показываем последнюю
            targetIndex = articles.length - 1;
        }
        currentArticleIndex = targetIndex;
        // Загружаем содержимое статьи (асинхронно)
        openArticle(targetIndex);
    }

    // ---- Открытие статьи (загружает содержимое по требованию) ----
    async function openArticle(index) {
        if (!currentLesson) return;
        const articles = currentLesson.articles;
        if (!articles || index < 0 || index >= articles.length) return;

        currentArticleIndex = index;
        const article = articles[index];
        const lessonId = currentLesson.id;

        // Устанавливаем статус studying
        await setArticleStatus(lessonId, index, 'studying');

        // Показываем индикатор загрузки
        articleContent.innerHTML = '<div style="text-align:center;padding:20px;">⏳ Загрузка статьи...</div>';

        // Загружаем содержимое
        const content = await loadArticleContent(article);
        articleContent.innerHTML = content;

        // Обновляем список (чтобы обновить иконки)
        renderArticles(currentLesson); // это вызовет перерисовку, но не загрузит содержимое заново
        updateNextArticleButton();
    }

    function updateNextArticleButton() {
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

    async function nextArticle() {
        if (!currentLesson || !currentLesson.articles) return;
        const articles = currentLesson.articles;
        const lessonId = currentLesson.id;

        // Помечаем текущую как прочитанную
        await setArticleStatus(lessonId, currentArticleIndex, 'read');

        // Переходим к следующей
        const nextIndex = currentArticleIndex + 1;
        if (nextIndex < articles.length) {
            await openArticle(nextIndex);
        } else {
            // Все статьи изучены
            nextArticleButton.disabled = true;
            nextArticleButton.textContent = '✅ Все статьи изучены';
            // Дополнительное сообщение
            articleContent.innerHTML += '<p style="color:green;font-weight:bold;">🎉 Поздравляем! Вы изучили все статьи этого урока.</p>';
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

            // Сбрасываем кеш статей при открытии нового урока
            articleCache = {};

            // Показываем контейнер урока
            lessonContainer.style.display = 'block';
            stepsContainer.style.display = 'none';

            // Видео
            if (lessonData.videos && lessonData.videos.length > 0) {
                videoContainer.style.display = 'block';
                await setVideoStatus(lesson.id, 0, 'studying');
                showVideo(lessonData.videos[0]);
            } else {
                videoContainer.style.display = 'none';
            }

            // Статьи
            if (lessonData.articles && lessonData.articles.length > 0) {
                renderArticles(lessonData);
            } else {
                articlesContainer.style.display = 'none';
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
        debugLog(`Видео ${videoId} встроено`, 'success');
    }

    // ---- Кнопка "Сделано! Перейти к следующему" ----
    async function markAsDone() {
        if (!currentLesson) return;

        const lessonId = currentLesson.id;
        // Проверяем, все ли статьи прочитаны (если есть)
        if (currentLesson.articles && currentLesson.articles.length > 0) {
            const allRead = progress[lessonId].articles.every(s => s === 'read');
            if (!allRead) {
                const confirmMsg = 'Вы ещё не прочитали все статьи этого урока. Отметить урок как завершённый?';
                if (!confirm(confirmMsg)) {
                    return;
                }
            }
        }

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
        if (currentLesson && lessonContainer.style.display === 'block') {
            doneButton.style.display = 'inline-block';
        } else {
            doneButton.style.display = 'none';
        }
    }

    // ---- Возврат к списку ----
    function goBack() {
        lessonContainer.style.display = 'none';
        stepsContainer.style.display = 'flex';
        videoWrapper.innerHTML = '';
        videoContainer.style.display = 'none';
        articlesContainer.style.display = 'none';
        articleContent.innerHTML = '';
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

        debugLog(`Приложение загружено, версия ${APP_VERSION}`);

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
        await checkGroupMembership();

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
        resetButton.addEventListener('click', resetProgress);
        joinGroupButton.addEventListener('click', handleJoinGroup);
        nextArticleButton.addEventListener('click', nextArticle);
    }

    function renderCourse(course) {
        courseTitle.textContent = course.title;
        courseDescription.textContent = course.description;
        renderSteps();
    }

    init();
})();