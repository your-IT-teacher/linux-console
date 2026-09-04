(function() {
    'use strict';

    // ---- Версия приложения ----
    const APP_VERSION = '2.9.1';

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
    const footerNote = document.querySelector('.footer-note');
    const joinGroupBlock = document.getElementById('joinGroupBlock');

    const articlesContainer = document.getElementById('articlesContainer');
    const articlesList = document.getElementById('articlesList');
    const articleContent = document.getElementById('articleContent');
    const nextArticleButton = document.getElementById('nextArticleButton');

    // Элементы тестирования
    const testContainer = document.getElementById('testContainer');
    const testProgress = document.getElementById('testProgress');
    const testQuestion = document.getElementById('testQuestion');
    const testOptions = document.getElementById('testOptions');
    const checkButton = document.getElementById('checkButton');
    const nextTaskButton = document.getElementById('nextTaskButton');
    const startTestButton = document.getElementById('startTestButton');

    // Дубли кнопок
    const backButton2 = document.getElementById('backButton2');
    const doneButton2 = document.getElementById('doneButton2');
    const backButton3 = document.getElementById('backButton3');
    const doneButton3 = document.getElementById('doneButton3');
    const backButton4 = document.getElementById('backButton4');

    // Уведомление о подписке и блок требования подписки
    const subscriptionNotice = document.getElementById('subscriptionNotice');
    const subscriptionRequired = document.getElementById('subscriptionRequired');
    const joinFromNotice = document.getElementById('joinFromNotice');
    const joinFromTest = document.getElementById('joinFromTest');

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
    let articleCache = {};

    // Состояние тестирования
    let tasksMeta = [];
    let tasksData = [];
    let currentTaskIndex = 0;
    let currentTaskAttempt = null;
    let isAnswerChecked = false;

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

    // ---- Вспомогательные функции ----
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

        if (vkBridge && typeof vkBridge.send === 'function') {
            try {
                const response = await vkBridge.send('VKWebAppStorageSet', { key, value });
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

    async function loadProgressFromStorage() {
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
            let isMember = false;
            if (data && typeof data.is_member !== 'undefined') {
                isMember = data.is_member === 1 || data.is_member === true || data.is_member === '1';
            } else if (data && data.group && typeof data.group.is_member !== 'undefined') {
                isMember = data.group.is_member === 1 || data.group.is_member === true || data.group.is_member === '1';
            }

            isGroupMember = isMember;

            // Обновляем UI в зависимости от подписки
            if (isGroupMember) {
                joinGroupButton.classList.add('joined');
                joinGroupButton.textContent = '✅ Вы в группе!';
                joinGroupButton.disabled = true;
                joinGroupStatus.textContent = 'Спасибо, что подписались! Вы будете получать уведомления о новых вебинарах.';
                // Скрываем уведомление и блок требования подписки
                if (subscriptionNotice) subscriptionNotice.style.display = 'none';
                if (subscriptionRequired) subscriptionRequired.style.display = 'none';
                debugLog('Пользователь состоит в группе', 'success');
            } else {
                joinGroupButton.classList.remove('joined');
                joinGroupButton.textContent = '📢 Вступить в группу';
                joinGroupButton.disabled = false;
                joinGroupStatus.textContent = 'Подпишитесь, чтобы не пропустить новые вебинары и получить доступ к закрытому контенту.';
                // Показываем уведомление
                if (subscriptionNotice) subscriptionNotice.style.display = 'flex';
                debugLog('Пользователь не состоит в группе', 'info');
            }
        } catch (error) {
            debugLog(`Ошибка VKWebAppGetGroupInfo: ${error.error_type || error.message}`, 'error');
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
            if (data && data.result) {
                isGroupMember = true;
                joinGroupButton.classList.add('joined');
                joinGroupButton.textContent = '✅ Вы в группе!';
                joinGroupButton.disabled = true;
                joinGroupStatus.textContent = 'Спасибо! Теперь вы будете в курсе новых вебинаров и получите доступ к закрытому контенту.';
                // Скрываем уведомление и блок требования подписки
                if (subscriptionNotice) subscriptionNotice.style.display = 'none';
                if (subscriptionRequired) subscriptionRequired.style.display = 'none';
                // Обновляем кнопку "Пройти тестирование", если она видна
                updateTestButtonVisibility();
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

    // ---- Инициализация прогресса ----
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
    }

    // ---- Загрузка содержимого статьи ----
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

    // ---- Отрисовка списка статей ----
    function renderArticles(lessonData, skipOpen = false) {
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
                openArticle(index);
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
            openArticle(targetIndex, true);
        }

        updateNextArticleButton();
    }

    // ---- Открытие статьи ----
    async function openArticle(index, fromRender = false) {
        if (!currentLesson) return;
        const articles = currentLesson.articles;
        if (!articles || index < 0 || index >= articles.length) return;

        currentArticleIndex = index;
        const article = articles[index];
        const lessonId = currentLesson.id;

        await setArticleStatus(lessonId, index, 'studying');

        articleContent.innerHTML = '<div style="text-align:center;padding:20px;">⏳ Загрузка статьи...</div>';

        const content = await loadArticleContent(article);
        articleContent.innerHTML = content;

        if (!fromRender) {
            renderArticles(currentLesson, true);
        } else {
            renderArticles(currentLesson, true);
        }
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

        await setArticleStatus(lessonId, currentArticleIndex, 'read');

        const nextIndex = currentArticleIndex + 1;
        if (nextIndex < articles.length) {
            await openArticle(nextIndex);
        } else {
            nextArticleButton.disabled = true;
            nextArticleButton.textContent = '✅ Все статьи изучены';
            articleContent.innerHTML += '<p style="color:green;font-weight:bold;">🎉 Поздравляем! Вы изучили все статьи этого урока.</p>';
            renderArticles(currentLesson, true);
        }
    }

    // ---- Работа с заданиями (тесты) ----
    function getTaskStatus(lessonId, taskIndex) {
        const p = progress[lessonId];
        if (!p || !p.tasks || taskIndex >= p.tasks.length) {
            return 'not_started';
        }
        return p.tasks[taskIndex] || 'not_started';
    }

    async function setTaskStatus(lessonId, taskIndex, status) {
        ensureLessonProgress(lessonId);
        if (taskIndex < 0 || taskIndex >= progress[lessonId].tasks.length) {
            debugLog(`Ошибка: индекс задания ${taskIndex} вне диапазона`, 'error');
            return;
        }
        progress[lessonId].tasks[taskIndex] = status;
        await saveProgressToStorage(progress);
        renderTasksProgress();
    }

    // ---- Загрузка заданий (только метаданные) ----
    async function loadTasks(lessonData) {
        if (!lessonData || !lessonData.tasks || lessonData.tasks.length === 0) {
            startTestButton.style.display = 'none';
            return;
        }
        // Кнопка тестирования показывается только если пользователь подписан
        updateTestButtonVisibility();
        tasksMeta = lessonData.tasks;
        tasksData = new Array(tasksMeta.length).fill(null);
        const lessonId = lessonData.id;
        ensureLessonProgress(lessonId, lessonData);
        renderTasksProgress();
        currentTaskIndex = 0;
        isAnswerChecked = false;
    }

    function updateTestButtonVisibility() {
        if (isGroupMember && tasksMeta && tasksMeta.length > 0) {
            startTestButton.style.display = 'inline-block';
        } else {
            startTestButton.style.display = 'none';
        }
    }

    // ---- Загрузка конкретного задания ----
    async function loadTaskContent(index) {
        if (tasksData[index] !== null) {
            return tasksData[index];
        }
        const meta = tasksMeta[index];
        if (!meta) return null;
        try {
            const data = await loadJSON(`data/${DEFAULT_COURSE}/lessons/${currentLesson.id}/${meta.file}`);
            tasksData[index] = data;
            return data;
        } catch (error) {
            debugLog(`Ошибка загрузки задания ${meta.id}: ${error.message}`, 'error');
            return null;
        }
    }

    function renderTasksProgress() {
        if (!currentLesson || !tasksMeta || tasksMeta.length === 0) return;
        const lessonId = currentLesson.id;
        let html = '';
        tasksMeta.forEach((meta, index) => {
            const status = getTaskStatus(lessonId, index);
            let icon = '⬜';
            if (status === 'passed') icon = '✅';
            else if (status === 'failed') icon = '❌';
            html += `<span class="task-progress-item" data-index="${index}">${icon}</span>`;
        });
        testProgress.innerHTML = html;
        document.querySelectorAll('.task-progress-item').forEach(el => {
            el.addEventListener('click', function() {
                const idx = parseInt(this.dataset.index);
                if (idx >= 0 && idx < tasksMeta.length) {
                    currentTaskIndex = idx;
                    showTask(idx);
                }
            });
        });
    }

    async function showTask(index) {
        if (!tasksMeta || index < 0 || index >= tasksMeta.length) return;
        let taskData = await loadTaskContent(index);
        if (!taskData) {
            testQuestion.innerHTML = '<p>Не удалось загрузить задание.</p>';
            return;
        }

        const block = taskData.block;
        const questionHTML = block.text || '<p>Вопрос не найден.</p>';
        const options = block.source.options || [];

        testQuestion.innerHTML = questionHTML;
        let optionsHTML = '';
        options.forEach((opt, optIndex) => {
            const isChecked = (currentTaskAttempt !== null && currentTaskAttempt === optIndex) ? 'checked' : '';
            optionsHTML += `
                <div class="test-option" data-index="${optIndex}">
                    <label>
                        <input type="radio" name="task" value="${optIndex}" ${isChecked} ${isAnswerChecked ? 'disabled' : ''}>
                        <span class="option-text">${opt.text}</span>
                    </label>
                    <div class="option-feedback" style="display:none;"></div>
                </div>
            `;
        });
        testOptions.innerHTML = optionsHTML;

        if (isAnswerChecked) {
            checkButton.textContent = 'Проверено ✓';
            checkButton.disabled = true;
            if (currentTaskAttempt !== null) {
                const selectedOption = options[currentTaskAttempt];
                if (selectedOption && !selectedOption.is_correct) {
                    const feedbackDiv = document.querySelectorAll('.test-option')[currentTaskAttempt].querySelector('.option-feedback');
                    if (feedbackDiv) {
                        feedbackDiv.textContent = selectedOption.feedback || 'Неверно. Попробуйте ещё раз.';
                        feedbackDiv.classList.add('show');
                    }
                } else if (selectedOption && selectedOption.is_correct) {
                    const optionDiv = document.querySelectorAll('.test-option')[currentTaskAttempt];
                    if (optionDiv) {
                        optionDiv.style.backgroundColor = '#d4edda';
                    }
                }
            }
        } else {
            checkButton.textContent = 'Проверить';
            checkButton.disabled = false;
            checkButton.onclick = checkAnswer;
            document.querySelectorAll('.option-feedback').forEach(el => {
                el.classList.remove('show');
                el.textContent = '';
            });
            document.querySelectorAll('.test-option').forEach(el => {
                el.style.backgroundColor = '';
            });
        }

        const nextIndex = index + 1;
        if (nextIndex < tasksMeta.length) {
            nextTaskButton.textContent = `Следующее задание → (${nextIndex+1}/${tasksMeta.length})`;
            nextTaskButton.disabled = !isAnswerChecked;
        } else {
            nextTaskButton.textContent = 'Завершить тестирование';
            nextTaskButton.disabled = !isAnswerChecked;
        }

        renderTasksProgress();
        testContainer.scrollIntoView({ behavior: 'smooth' });
    }

    // ---- Проверка ответа (исправленная) ----
    function checkAnswer() {
        if (isAnswerChecked) {
            debugLog('checkAnswer: уже проверено, выходим', 'warn');
            return;
        }
        const selectedRadio = document.querySelector('input[name="task"]:checked');
        if (!selectedRadio) {
            alert('Пожалуйста, выберите вариант ответа.');
            return;
        }
        const selectedIndex = parseInt(selectedRadio.value);
        const taskData = tasksData[currentTaskIndex];
        if (!taskData) {
            debugLog('checkAnswer: нет данных задания', 'error');
            return;
        }
        const options = taskData.block.source.options;
        const selectedOption = options[selectedIndex];
        const isCorrect = selectedOption.is_correct;

        currentTaskAttempt = selectedIndex;

        // Отключаем все радио-кнопки
        document.querySelectorAll('input[name="task"]').forEach(el => el.disabled = true);

        if (isCorrect) {
            debugLog('Правильный ответ!', 'success');
            checkButton.textContent = '✅ Правильно!';
            checkButton.disabled = true;
            const optionDiv = document.querySelectorAll('.test-option')[selectedIndex];
            if (optionDiv) optionDiv.style.backgroundColor = '#d4edda';
            const lessonId = currentLesson.id;
            setTaskStatus(lessonId, currentTaskIndex, 'passed');
            isAnswerChecked = true;
            const nextIndex = currentTaskIndex + 1;
            if (nextIndex < tasksMeta.length) {
                nextTaskButton.disabled = false;
            } else {
                nextTaskButton.disabled = false;
                nextTaskButton.textContent = 'Завершить тестирование';
            }
            checkButton.onclick = null;
        } else {
            // Неправильный ответ – показываем подсказку
            debugLog('Неверный ответ, показываем подсказку и меняем кнопку', 'info');
            checkButton.textContent = 'Попробовать ещё раз';
            checkButton.disabled = false;
            
            const optionDivs = document.querySelectorAll('.test-option');
            if (optionDivs.length > selectedIndex) {
                const feedbackDiv = optionDivs[selectedIndex].querySelector('.option-feedback');
                if (feedbackDiv) {
                    const feedbackText = selectedOption.feedback || 'Неверно. Попробуйте ещё раз.';
                    feedbackDiv.textContent = feedbackText;
                    feedbackDiv.classList.add('show');
                    debugLog(`Подсказка отображена: ${feedbackText}`, 'info');
                } else {
                    debugLog('Не найден .option-feedback для варианта', 'error');
                }
            } else {
                debugLog('Не найден .test-option для индекса', 'error');
            }
            
            nextTaskButton.disabled = true;
            checkButton.onclick = retryAnswer;
        }
    }

    // ---- Повторная попытка (исправленная) ----
    function retryAnswer() {
        debugLog('Повторная попытка для задания ' + (currentTaskIndex + 1), 'info');
        
        // Сбрасываем только радиокнопки, НЕ трогаем подсказки
        document.querySelectorAll('input[name="task"]').forEach(el => {
            el.checked = false;
            el.disabled = false;
        });
        
        // Сбрасываем выделение вариантов
        document.querySelectorAll('.test-option').forEach(el => {
            el.style.backgroundColor = '';
        });
        
        // Сбрасываем состояние
        isAnswerChecked = false;
        currentTaskAttempt = null;
        
        // Возвращаем кнопку в исходное состояние
        checkButton.textContent = 'Проверить';
        checkButton.disabled = false;
        checkButton.onclick = checkAnswer;
        nextTaskButton.disabled = true;
        
        // Сохраняем статус failed
        const lessonId = currentLesson.id;
        setTaskStatus(lessonId, currentTaskIndex, 'failed');
        debugLog(`Задание ${currentTaskIndex+1} помечено как failed (повторная попытка)`, 'info');
        
        // НЕ вызываем showTask – вопрос остаётся на месте, подсказка не исчезает
        debugLog('retryAnswer: состояние сброшено, подсказка сохранена', 'info');
    }

    // ---- Переход к следующему заданию ----
    function nextTask() {
        const nextIndex = currentTaskIndex + 1;
        if (nextIndex < tasksMeta.length) {
            currentTaskIndex = nextIndex;
            isAnswerChecked = false;
            currentTaskAttempt = null;
            checkButton.onclick = checkAnswer;
            showTask(nextIndex);
        } else {
            alert('🎉 Поздравляем! Вы завершили все задания этого урока.');
            hideTest();
        }
    }

    // ---- Показать/скрыть тест ----
    function startTest() {
        if (!isGroupMember) {
            // Показываем блок требования подписки
            videoContainer.style.display = 'none';
            articlesContainer.style.display = 'none';
            testContainer.style.display = 'none';
            if (subscriptionRequired) subscriptionRequired.style.display = 'block';
            return;
        }

        if (!currentLesson || !tasksMeta || tasksMeta.length === 0) {
            alert('В этом уроке пока нет заданий.');
            return;
        }
        videoContainer.style.display = 'none';
        articlesContainer.style.display = 'none';
        testContainer.style.display = 'block';
        if (subscriptionRequired) subscriptionRequired.style.display = 'none';
        const lessonId = currentLesson.id;
        let firstNotPassed = 0;
        for (let i = 0; i < tasksMeta.length; i++) {
            const status = getTaskStatus(lessonId, i);
            if (status !== 'passed') {
                firstNotPassed = i;
                break;
            }
        }
        currentTaskIndex = firstNotPassed;
        isAnswerChecked = false;
        currentTaskAttempt = null;
        checkButton.onclick = checkAnswer;
        showTask(currentTaskIndex);
        startTestButton.style.display = 'none';
    }

    function hideTest() {
        testContainer.style.display = 'none';
        if (subscriptionRequired) subscriptionRequired.style.display = 'none';
        if (currentLesson && currentLesson.videos && currentLesson.videos.length > 0) {
            videoContainer.style.display = 'block';
        }
        if (currentLesson && currentLesson.articles && currentLesson.articles.length > 0) {
            articlesContainer.style.display = 'block';
        }
        updateTestButtonVisibility();
        renderTasksProgress();
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

            articleCache = {};

            userBlock.style.display = 'none';
            joinGroupBlock.style.display = 'none';
            courseDescription.style.display = 'none';
            if (footerNote) footerNote.style.display = 'none';

            lessonContainer.style.display = 'block';
            stepsContainer.style.display = 'none';

            await loadTasks(lessonData);

            if (lessonData.videos && lessonData.videos.length > 0) {
                videoContainer.style.display = 'block';
                await setVideoStatus(lesson.id, 0, 'studying');
                showVideo(lessonData.videos[0]);
            } else {
                videoContainer.style.display = 'none';
            }

            if (lessonData.articles && lessonData.articles.length > 0) {
                renderArticles(lessonData, false);
            } else {
                articlesContainer.style.display = 'none';
            }

            testContainer.style.display = 'none';
            if (subscriptionRequired) subscriptionRequired.style.display = 'none';
            updateTestButtonVisibility();

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
            if (doneButton2) doneButton2.style.display = 'inline-block';
            if (doneButton3) doneButton3.style.display = 'inline-block';
        } else {
            doneButton.style.display = 'none';
            if (doneButton2) doneButton2.style.display = 'none';
            if (doneButton3) doneButton3.style.display = 'none';
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
        testContainer.style.display = 'none';
        if (subscriptionRequired) subscriptionRequired.style.display = 'none';
        currentLesson = null;
        doneButton.style.display = 'none';
        if (doneButton2) doneButton2.style.display = 'none';
        if (doneButton3) doneButton3.style.display = 'none';
        startTestButton.style.display = 'none';

        userBlock.style.display = '';
        joinGroupBlock.style.display = '';
        courseDescription.style.display = '';
        if (footerNote) footerNote.style.display = '';

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

        if (backButton2) backButton2.addEventListener('click', goBack);
        if (doneButton2) doneButton2.addEventListener('click', markAsDone);
        if (backButton3) backButton3.addEventListener('click', goBack);
        if (doneButton3) doneButton3.addEventListener('click', markAsDone);
        if (backButton4) backButton4.addEventListener('click', goBack);

        if (joinFromNotice) joinFromNotice.addEventListener('click', handleJoinGroup);
        if (joinFromTest) joinFromTest.addEventListener('click', handleJoinGroup);

        startTestButton.addEventListener('click', startTest);
        checkButton.addEventListener('click', checkAnswer);
        nextTaskButton.addEventListener('click', nextTask);
    }

    function renderCourse(course) {
        courseTitle.textContent = course.title;
        courseDescription.textContent = course.description;
        renderSteps();
    }

    init();
})();