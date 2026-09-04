import { debugLog } from './logger.js';
import { getTaskStatus, setTaskStatus } from './progress.js';
import { loadJSON } from './main.js';
import { isGroupMember } from './vk-bridge.js';

// DOM-элементы
const testContainer = document.getElementById('testContainer');
const testProgress = document.getElementById('testProgress');
const testQuestion = document.getElementById('testQuestion');
const testOptions = document.getElementById('testOptions');
const checkButton = document.getElementById('checkButton');
const nextTaskButton = document.getElementById('nextTaskButton');
const startTestButton = document.getElementById('startTestButton');
const subscriptionRequired = document.getElementById('subscriptionRequired');
const videoContainer = document.getElementById('videoContainer');
const articlesContainer = document.getElementById('articlesContainer');

let tasksMeta = [];
let tasksData = [];
let currentTaskIndex = 0;
let currentTaskAttempt = null;
let isAnswerChecked = false;
let currentLesson = null;
let onHideTestCallback = null;
let onUpdateTestButtonVisibility = null;

export function setCurrentLesson(lesson) {
    currentLesson = lesson;
}

export function setCallbacks(hideTestCallback, updateVisibilityCallback) {
    onHideTestCallback = hideTestCallback;
    onUpdateTestButtonVisibility = updateVisibilityCallback;
}

export async function loadTasks(lessonData) {
    if (!lessonData || !lessonData.tasks || lessonData.tasks.length === 0) {
        startTestButton.style.display = 'none';
        return;
    }
    if (onUpdateTestButtonVisibility) onUpdateTestButtonVisibility();
    tasksMeta = lessonData.tasks;
    tasksData = new Array(tasksMeta.length).fill(null);
    const lessonId = lessonData.id;
    // ensureLessonProgress вызывается в main
    renderTasksProgress();
    currentTaskIndex = 0;
    isAnswerChecked = false;
}

export function updateTestButtonVisibility() {
    if (isGroupMember && tasksMeta && tasksMeta.length > 0) {
        startTestButton.style.display = 'inline-block';
    } else {
        startTestButton.style.display = 'none';
    }
}

export async function loadTaskContent(index) {
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

export function renderTasksProgress() {
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

export async function showTask(index) {
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

export function checkAnswer() {
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

    document.querySelectorAll('input[name="task"]').forEach(el => el.disabled = true);

    if (isCorrect) {
        debugLog('Правильный ответ!', 'success');
        checkButton.textContent = '✅ Правильно!';
        checkButton.disabled = true;
        const optionDiv = document.querySelectorAll('.test-option')[selectedIndex];
        if (optionDiv) optionDiv.style.backgroundColor = '#d4edda';
        const lessonId = currentLesson.id;
        setTaskStatus(lessonId, currentTaskIndex, 'passed', () => {
            renderTasksProgress();
        });
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

export function retryAnswer() {
    debugLog('Повторная попытка для задания ' + (currentTaskIndex + 1), 'info');
    
    document.querySelectorAll('input[name="task"]').forEach(el => {
        el.checked = false;
        el.disabled = false;
    });
    
    document.querySelectorAll('.test-option').forEach(el => {
        el.style.backgroundColor = '';
    });
    
    isAnswerChecked = false;
    currentTaskAttempt = null;
    
    checkButton.textContent = 'Проверить';
    checkButton.disabled = false;
    checkButton.onclick = checkAnswer;
    nextTaskButton.disabled = true;
    
    const lessonId = currentLesson.id;
    setTaskStatus(lessonId, currentTaskIndex, 'failed', () => {
        renderTasksProgress();
    });
    debugLog(`Задание ${currentTaskIndex+1} помечено как failed (повторная попытка)`, 'info');
    debugLog('retryAnswer: состояние сброшено, подсказка сохранена', 'info');
}

export function nextTask() {
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

export function startTest() {
    if (!isGroupMember) {
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

export function hideTest() {
    testContainer.style.display = 'none';
    if (subscriptionRequired) subscriptionRequired.style.display = 'none';
    if (onHideTestCallback) onHideTestCallback();
    if (onUpdateTestButtonVisibility) onUpdateTestButtonVisibility();
    renderTasksProgress();
}