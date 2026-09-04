import { GROUP_ID } from './config.js';
import { debugLog } from './logger.js';

const vkBridge = window.vkBridge;

// DOM-элементы
const joinGroupButton = document.getElementById('joinGroupButton');
const joinGroupStatus = document.getElementById('joinGroupStatus');
const subscriptionNotice = document.getElementById('subscriptionNotice');
const subscriptionRequired = document.getElementById('subscriptionRequired');
const userBlock = document.getElementById('userBlock');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

export let isGroupMember = false;

// Обновление UI в зависимости от членства в группе
function updateGroupUI(member) {
    isGroupMember = member;
    if (member) {
        joinGroupButton.classList.add('joined');
        joinGroupButton.textContent = '✅ Вы в группе!';
        joinGroupButton.disabled = true;
        joinGroupStatus.textContent = 'Спасибо, что подписались! Вы будете получать уведомления о новых вебинарах.';
        if (subscriptionNotice) subscriptionNotice.style.display = 'none';
        if (subscriptionRequired) subscriptionRequired.style.display = 'none';
        debugLog('Пользователь состоит в группе', 'success');
    } else {
        joinGroupButton.classList.remove('joined');
        joinGroupButton.textContent = '📢 Вступить в группу';
        joinGroupButton.disabled = false;
        joinGroupStatus.textContent = 'Подпишитесь, чтобы не пропустить новые вебинары и получить доступ к закрытому контенту.';
        if (subscriptionNotice) subscriptionNotice.style.display = 'flex';
        debugLog('Пользователь не состоит в группе', 'info');
    }
}

// Проверка членства в группе
export async function checkGroupMembership() {
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
        updateGroupUI(isMember);
    } catch (error) {
        debugLog(`Ошибка VKWebAppGetGroupInfo: ${error.error_type || error.message}`, 'error');
        joinGroupButton.disabled = true;
        joinGroupButton.textContent = '⚠️ Ошибка';
        joinGroupStatus.textContent = 'Не удалось проверить подписку. Попробуйте позже.';
    }
}

// Обработчик вступления в группу
export async function handleJoinGroup() {
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
            updateGroupUI(true);
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

// Получение информации о пользователе
export async function fetchUserInfo() {
    try {
        if (!vkBridge || typeof vkBridge.send !== 'function') {
            userBlock.style.display = 'flex';
            userName.textContent = 'Гость (без VK)';
            userAvatar.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"%3E%3Ccircle cx="20" cy="20" r="20" fill="%23e1e4e8"/%3E%3Ctext x="20" y="26" font-size="16" text-anchor="middle" fill="%238e8e93"%3E?%3C/text%3E%3C/svg%3E';
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

// Вспомогательная функция для открытия внешних ссылок
export function openExternal(url) {
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