import {
    DEFAULT_PROMPT,
    MODULE_NAME,
    PROMPT_KEY,
    VERSION,
    buildAudioSegments,
    buildTimeline,
    extractReading,
    formatTime,
    getActiveReplyText,
    makeAudioRequestBody,
    mergeVoiceSettings,
    migratePromptSettings,
    playInOrder,
    sanitizeReadableText,
    stripReadingBlocks,
    timelinePosition,
    timelineTarget
} from './core.js';

const DEFAULT_SETTINGS = {
    baseUrl: 'https://www.nengpa.com/v1',
    apiKey: '',
    model: 'speech-2.8-hd',
    playbackMode: 'all',
    audioFormat: 'wav',
    sampleRate: 32000,
    speed: 1,
    dialogueSpeed: 1,
    languageBoost: 'Chinese',
    contextHideStructure: true,
    voices: {
        narrator: 'moss_audio_46b3651e-a85e-11f1-8957-ba6628da9bfd',
        protagonist: 'moss_audio_cbb39430-a862-11f1-aa1d-d2651eedd987',
        heroine1: 'moss_audio_499a9275-a861-11f1-b7bb-b695f68c934a',
        heroine2: 'moss_audio_1d309c5c-a1ff-11f1-acee-26b6a8502990',
        heroine3: 'moss_audio_54ffe2af-a030-11f1-8957-ba6628da9bfd',
        heroine4: 'moss_audio_40e2f4fa-a201-11f1-a626-8a59b47fb1f9',
        maleNpc1: 'moss_audio_cbb39430-a862-11f1-aa1d-d2651eedd987',
        maleNpc2: 'moss_audio_0bcb90c6-a204-11f1-b06d-eaacce949834',
        femaleNpc1: 'moss_audio_499a9275-a861-11f1-b7bb-b695f68c934a',
        femaleNpc2: 'moss_audio_1d309c5c-a1ff-11f1-acee-26b6a8502990'
    },
    promptEnabled: false,
    promptPosition: 0,
    promptRole: 0,
    promptDepth: 4,
    prompt: DEFAULT_PROMPT
};

const VOICE_PRESETS = [
    ['旁白（女5分钟）', 'moss_audio_46b3651e-a85e-11f1-8957-ba6628da9bfd'],
    ['旁白（女）', 'moss_audio_485c1515-a203-11f1-aff1-6e4b0c54af8d'],
    ['苏青（稳定语气）', 'moss_audio_cbb39430-a862-11f1-aa1d-d2651eedd987'],
    ['苏青（5分钟）', 'moss_audio_0e4e8613-a85f-11f1-acee-26b6a8502990'],
    ['苏青（男）', 'moss_audio_f135398f-a201-11f1-aff1-6e4b0c54af8d'],
    ['陈洛', 'moss_audio_8bec2991-a85f-11f1-ac4a-de88e9c22e4a'],
    ['赵牧', 'moss_audio_d70fd7a2-a85f-11f1-aff1-6e4b0c54af8d'],
    ['老宝玉', 'moss_audio_e184495d-a203-11f1-b06d-eaacce949834'],
    ['老宝玉（5分钟）', 'moss_audio_ddb30f20-a861-11f1-8f51-7270dd4a9232'],
    ['无极魔尊', 'moss_audio_d938076b-a439-11f1-b06d-eaacce949834'],
    ['齐静春', 'moss_audio_2d829f1b-a202-11f1-aff1-6e4b0c54af8d'],
    ['韩立', 'moss_audio_0bcb90c6-a204-11f1-b06d-eaacce949834'],
    ['苏倩（5分钟）', 'moss_audio_499a9275-a861-11f1-b7bb-b695f68c934a'],
    ['虞寻歌2.0', 'moss_audio_fc774bdd-a438-11f1-a626-8a59b47fb1f9'],
    ['虞寻歌（工作室）', 'moss_audio_560428c9-a435-11f1-8957-ba6628da9bfd'],
    ['星宿年轻音色', 'moss_audio_cc1df167-a434-11f1-aa1d-d2651eedd987'],
    ['虞寻歌', 'moss_audio_1d309c5c-a1ff-11f1-acee-26b6a8502990'],
    ['苏倩', 'moss_audio_54ffe2af-a030-11f1-8957-ba6628da9bfd'],
    ['商心慈', 'moss_audio_40e2f4fa-a201-11f1-a626-8a59b47fb1f9'],
    ['阎冰卿', 'moss_audio_7d6cd64a-a200-11f1-ac4a-de88e9c22e4a'],
    ['星宿仙尊', 'moss_audio_a82f1e07-a439-11f1-8900-9edb4a3ef07d'],
    ['文思月', 'moss_audio_aa208aaa-a1ff-11f1-94de-e22cb72c308c'],
    ['慕沛灵', 'moss_audio_7ecde524-a201-11f1-94de-e22cb72c308c'],
    ['梅凝', 'moss_audio_be8ada8f-a203-11f1-bcbd-9a2b20d980c0'],
    ['白凝冰', 'moss_audio_b78aaac7-a204-11f1-bf36-dabba993c40d']
];

const context = globalThis.SillyTavern?.getContext?.();
if (!context) {
    console.error('Tavo Voice Player: SillyTavern context is unavailable.');
    throw new Error('SillyTavern context is unavailable');
}

const storedSettings = context.extensionSettings[MODULE_NAME] || {};
const settings = mergeSettings(DEFAULT_SETTINGS, storedSettings);
context.extensionSettings[MODULE_NAME] = settings;

let settingsPanel;
let activeSession = null;
let audioContext;
const memoryAudioCache = new Map();
const activeCacheWrites = new Set();

function mergeSettings(defaults, stored) {
    const result = { ...defaults, ...(stored || {}) };
    result.voices = mergeVoiceSettings(defaults.voices, stored);
    delete result.narratorVoice;
    delete result.dialogueVoice;
    delete result.protagonistVoice;
    delete result.heroineVoice;
    delete result.maleNpcVoice;
    delete result.femaleNpcVoice;
    return result;
}

function getPath(object, path) {
    return path.split('.').reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => {
        if (!node[key] || typeof node[key] !== 'object') node[key] = {};
        return node[key];
    }, object);
    parent[last] = value;
}

function buildPrompt() {
    const open = settings.contextHideStructure ? '<!--MINIMAX_TTS' : '[[MINIMAX_TTS]]';
    const close = settings.contextHideStructure ? '-->' : '[[/MINIMAX_TTS]]';
    const prompt = String(settings.prompt || DEFAULT_PROMPT);
    return prompt
        .replaceAll('{{OPEN_MARKER}}', open)
        .replaceAll('{{CLOSE_MARKER}}', close)
        .replaceAll('<!--MINIMAX_TTS', open)
        .replaceAll('-->', close);
}

let promptDefaults = { prompt: DEFAULT_PROMPT };

async function loadPromptDefaults() {
    const read = async file => {
        const response = await fetch(new URL(file, import.meta.url));
        if (!response.ok) throw new Error('Could not load ' + file);
        return (await response.text()).trim();
    };
    try {
        const [split, performance] = await Promise.all([
            read('./prompt-splitting.txt'),
            read('./prompt-performance.txt')
        ]);
        const readable = value => value
            .replaceAll('{{OPEN_MARKER}}', '<!--MINIMAX_TTS')
            .replaceAll('{{CLOSE_MARKER}}', '-->');
        promptDefaults = { prompt: [readable(split), readable(performance)].filter(Boolean).join('\n\n') };
    } catch (error) {
        console.error('Tavo Voice Player: prompt defaults failed to load', error);
    }

    migratePromptSettings(settings, storedSettings, promptDefaults, DEFAULT_PROMPT);
    // Keep the migrated version in the live settings object so later saves do not
    // re-append rules that the user has deliberately edited or removed.
    storedSettings.promptMigrationVersion = settings.promptMigrationVersion;
    context.extensionSettings[MODULE_NAME] = settings;
    context.saveSettingsDebounced();
}

function updatePromptInjection() {
    if (typeof context.setExtensionPrompt !== 'function') return;
    const prompt = settings.promptEnabled ? buildPrompt() : '';
    const position = Number(settings.promptPosition);
    const depth = Math.max(0, Math.min(10000, Number(settings.promptDepth) || 0));
    const role = Math.max(0, Math.min(2, Number(settings.promptRole) || 0));
    context.setExtensionPrompt(PROMPT_KEY, prompt, position, depth, false, role);
}

globalThis.tavoVoicePromptInterceptor = function (chat) {
    if (!Array.isArray(chat)) return;
    for (const message of chat) {
        if (message && !message.is_user && typeof message.mes === 'string') {
            message.mes = stripReadingBlocks(message.mes);
        }
    }
};

async function loadSettingsPanel() {
    if (document.getElementById('tavo_voice_settings')) {
        settingsPanel = document.getElementById('tavo_voice_settings');
        return;
    }
    const html = await context.renderExtensionTemplateAsync('third-party/tavo-sillytavern-voice', 'settings');
    const holder = document.createElement('div');
    holder.innerHTML = html;
    settingsPanel = holder.firstElementChild;
    if (!settingsPanel) throw new Error('Could not render Tavo Voice Player settings.');
    document.getElementById('extensions_settings')?.append(settingsPanel);
    const versionTag = settingsPanel.querySelector('[data-plugin-version]');
    if (versionTag) versionTag.textContent = 'v' + VERSION;
    populateVoiceOptions();
    bindSettingsPanel();
    syncSettingsPanel();
}

function populateVoiceOptions() {
    for (const select of settingsPanel.querySelectorAll('select[data-voice-picker]')) {
        const selected = String(getPath(settings, select.dataset.setting) || '');
        for (const [name, id] of VOICE_PRESETS) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = name;
            select.append(option);
        }
        if (selected && !VOICE_PRESETS.some(([, id]) => id === selected)) {
            const option = document.createElement('option');
            option.value = selected;
            option.textContent = '自定义音色（名称未收录）';
            select.append(option);
        }
    }
}

function bindSettingsPanel() {
    for (const input of settingsPanel.querySelectorAll('[data-setting]')) {
        const path = input.dataset.setting;
        const update = () => {
            const value = input.type === 'checkbox'
                ? input.checked
                : (input.type === 'number' || input.type === 'range' ? Number(input.value) : input.value);
            setPath(settings, path, value);
            if (input.type === 'range') updateRangeOutput(path, input.value);
            if (path === 'playbackMode') {
                for (const player of document.querySelectorAll('.tavo-st-player[data-state="idle"]')) {
                    player.querySelector('.tavo-st-detail').textContent = playbackModeLabel();
                }
            }
            context.saveSettingsDebounced();
            updatePromptInjection();
            updateDepthVisibility();
        };
        input.addEventListener(input.type === 'range' ? 'input' : 'change', update);
    }

    settingsPanel.addEventListener('click', async event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        event.preventDefault();
        if (action === 'reset-prompt') {
            settings.prompt = promptDefaults.prompt;
            syncSettingsPanel();
            context.saveSettingsDebounced();
            updatePromptInjection();
        }
        if (action === 'clear-cache') {
            await clearAudioCache();
            setSettingsStatus('音频缓存已清空');
        }
    });
}

function syncSettingsPanel() {
    if (!settingsPanel) return;
    for (const input of settingsPanel.querySelectorAll('[data-setting]')) {
        const value = getPath(settings, input.dataset.setting);
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else if (value !== undefined && value !== null) input.value = String(value);
        if (input.type === 'range') updateRangeOutput(input.dataset.setting, input.value);
    }
    updateDepthVisibility();
}

function updateRangeOutput(path, value) {
    const output = settingsPanel?.querySelector('[data-output="' + path + '"]');
    if (output) output.textContent = Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function updateDepthVisibility() {
    const depth = settingsPanel?.querySelector('[data-show-depth]');
    if (depth) depth.hidden = Number(settings.promptPosition) !== 1;
}

function setSettingsStatus(message) {
    const status = settingsPanel?.querySelector('.tavo-st-settings-status');
    if (!status) return;
    status.textContent = message;
    clearTimeout(status._clearTimer);
    status._clearTimer = setTimeout(() => { status.textContent = ''; }, 3500);
}

function notifyError(message) {
    if (globalThis.toastr?.error) globalThis.toastr.error(message, 'Tavo Voice Player');
    else console.error('Tavo Voice Player:', message);
}

function getMessageElement(messageId) {
    const target = String(messageId);
    return Array.from(document.querySelectorAll('#chat .mes[mesid]'))
        .find(element => element.getAttribute('mesid') === target) || null;
}

function playbackModeLabel() {
    return { narrator: '仅旁白', dialogue: '仅角色对话' }[settings.playbackMode] || '旁白 + 对话';
}

function createPlayer() {
    const root = document.createElement('div');
    root.className = 'tavo-st-player';
    root.dataset.state = 'idle';
    root.innerHTML = [
        '<button class="tavo-st-play" type="button" data-action="play" data-icon="play" title="播放语音" aria-label="播放语音"></button>',
        '<div class="tavo-st-body">',
        '<div class="tavo-st-head"><span class="tavo-st-title">语音朗读</span><span class="tavo-st-time">0:00 / 0:00</span></div>',
        '<div class="tavo-st-scrubber"><div class="tavo-st-rail" aria-hidden="true"></div>',
        '<input class="tavo-st-progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="拖动调整整段回复的播放进度" disabled></div>',
        '<div class="tavo-st-foot"><span class="tavo-st-detail"></span><span class="tavo-st-ready"></span></div>',
        '</div>',
        '<button class="tavo-st-more" type="button" data-action="menu" title="更多语音操作" aria-label="更多语音操作" aria-expanded="false"></button>',
        '<div class="tavo-st-menu" hidden>',
        '<button type="button" data-action="stop">停止</button>',
        '<button type="button" data-action="regenerate">重新生成</button>',
        '<button type="button" data-action="clear-cache">清空音频缓存</button>',
        '</div>'
    ].join('');
    root.querySelector('.tavo-st-detail').textContent = playbackModeLabel();
    const track = root.querySelector('.tavo-st-progress');
    track.addEventListener('pointerdown', () => { root.dataset.seeking = 'true'; });
    track.addEventListener('input', () => previewTimeline(root));
    track.addEventListener('pointerup', () => {
        setTimeout(() => { delete root.dataset.seeking; }, 0);
    });
    track.addEventListener('pointercancel', () => {
        setTimeout(() => {
            delete root.dataset.seeking;
            if (activeSession?.player === root) updateAudioProgress(activeSession);
        }, 0);
    });
    track.addEventListener('change', () => {
        delete root.dataset.seeking;
        seekPlayback(root);
    });
    return root;
}

function refreshMessagePlayer(messageId) {
    const index = Number(messageId);
    const message = context.chat?.[index];
    const element = getMessageElement(messageId);
    if (!message || !element || message.is_user || message.is_system || element.getAttribute('is_user') === 'true') return;
    const block = element.querySelector('.mes_block');
    if (!block) return;

    const signature = String(message.swipe_id ?? 0) + ':' + getActiveReplyText(message);
    let player = element.querySelector('.tavo-st-player');
    if (!player) player = createPlayer();
    if (player.parentElement !== block) block.append(player);
    if (player.dataset.signature && player.dataset.signature !== signature &&
        activeSession?.messageId === index) stopSession('切换了回复');
    player.dataset.signature = signature;
    player.dataset.messageId = String(index);
}

function refreshAllPlayers() {
    for (let index = 0; index < (context.chat?.length || 0); index++) {
        refreshMessagePlayer(index);
    }
}

function updatePlayer(player, state, detail, ready, total, title = '语音朗读') {
    if (!player?.isConnected) return;
    player.dataset.state = state;
    const button = player.querySelector('.tavo-st-play');
    const running = state !== 'idle' && state !== 'paused';
    button.dataset.icon = running ? 'pause' : 'play';
    button.title = running ? '暂停' : (state === 'paused' ? '继续播放' : '播放语音');
    button.setAttribute('aria-label', button.title);
    player.querySelector('.tavo-st-progress').disabled = state === 'idle';
    player.querySelector('.tavo-st-title').textContent = title;
    player.querySelector('.tavo-st-detail').textContent = detail || playbackModeLabel();
    updateReadyCount(player, ready, total);
}

function updateReadyCount(player, ready, total) {
    player.querySelector('.tavo-st-ready').textContent = total ? '已就绪 ' + ready + '/' + total : '';
}

function renderSession(session) {
    updatePlayer(session.player, session.paused ? 'paused' : session.phase,
        session.paused ? '已暂停 · 点击继续' : session.segmentLabel,
        session.readyCount, session.total, session.paused ? '语音朗读' : session.title);
}

function setSessionPhase(session, phase, title) {
    if (activeSession !== session || session.signal.aborted) return;
    session.phase = phase;
    session.title = title;
    renderSession(session);
}

function unlockAudio() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
        audioContext ||= new AudioContextClass();
        if (audioContext.state === 'suspended') void audioContext.resume();
        const buffer = audioContext.createBuffer(1, 1, 22050);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
    } catch (error) {
        console.debug('Tavo Voice Player: audio unlock failed', error);
    }
}

function cacheMaterial(segment) {
    return JSON.stringify({
        baseUrl: settings.baseUrl.replace(/\/+$/, ''),
        model: settings.model,
        text: segment.text,
        voice: segment.voice,
        speed: segment.speed,
        emotion: segment.emotion,
        audioFormat: settings.audioFormat,
        sampleRate: settings.sampleRate,
        languageBoost: settings.languageBoost
    });
}

async function hashText(value) {
    if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return (hash >>> 0).toString(16);
}

function openCacheDatabase() {
    if (!globalThis.indexedDB) return Promise.resolve(null);
    if (openCacheDatabase.promise) return openCacheDatabase.promise;
    openCacheDatabase.promise = new Promise(resolve => {
        const request = indexedDB.open('tavo-voice-player-cache', 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('audio')) request.result.createObjectStore('audio');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = request.onblocked = () => resolve(null);
    });
    return openCacheDatabase.promise;
}

async function readAudioCache(key) {
    if (memoryAudioCache.has(key)) return memoryAudioCache.get(key);
    const db = await openCacheDatabase();
    if (!db) return null;
    return new Promise(resolve => {
        const request = db.transaction('audio', 'readonly').objectStore('audio').get(key);
        request.onsuccess = () => {
            const value = request.result instanceof Blob ? request.result : null;
            if (value) memoryAudioCache.set(key, value);
            resolve(value);
        };
        request.onerror = () => resolve(null);
    });
}

async function writeAudioCache(key, blob) {
    memoryAudioCache.set(key, blob);
    const db = await openCacheDatabase();
    if (!db) return;
    await new Promise(resolve => {
        const transaction = db.transaction('audio', 'readwrite');
        transaction.objectStore('audio').put(blob, key);
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    });
}

async function storeGeneratedAudio(key, blob) {
    const operation = writeAudioCache(key, blob);
    activeCacheWrites.add(operation);
    try {
        await operation;
    } finally {
        activeCacheWrites.delete(operation);
    }
}

async function clearAudioCache() {
    if (activeSession) stopSession('正在清空音频缓存');
    await Promise.allSettled(Array.from(activeCacheWrites));
    memoryAudioCache.clear();
    const db = await openCacheDatabase();
    if (!db) return;
    await new Promise(resolve => {
        const transaction = db.transaction('audio', 'readwrite');
        transaction.objectStore('audio').clear();
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    });
}

function hexToBytes(value) {
    const hex = String(value || '').replace(/^0x/i, '').replace(/\s+/g, '');
    if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
    const bytes = new Uint8Array(hex.length / 2);
    for (let index = 0; index < bytes.length; index++) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function decodeAudioString(value, format) {
    const text = String(value || '').trim();
    const hex = hexToBytes(text);
    if (hex) return new Blob([hex], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    const base64 = text.replace(/^data:audio\/[^;]+;base64,/i, '');
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        return new Blob([bytes], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    } catch {
        return null;
    }
}

async function responseToAudioBlob(response) {
    const contentType = response.headers.get('content-type') || '';
    const format = settings.audioFormat;
    if (/json|text\//i.test(contentType)) {
        const body = await response.text();
        let payload = body;
        try {
            const parsed = JSON.parse(body);
            payload = parsed.audio_hex || parsed.audio || parsed.data || parsed.result || parsed.content || body;
            if (Array.isArray(payload)) return new Blob([new Uint8Array(payload)], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
            if (payload && typeof payload === 'object') payload = payload.hex || payload.audio || payload.data || '';
        } catch {}
        const blob = decodeAudioString(payload, format);
        if (blob && blob.size > 100) return blob;
        throw new Error('接口返回的音频不是可识别的 WAV/MP3、十六进制或 Base64 数据');
    }
    const blob = await response.blob();
    if (blob.size < 100) throw new Error('接口返回的音频为空');
    const possibleHex = new TextDecoder().decode(await blob.arrayBuffer()).trim();
    const decodedHex = hexToBytes(possibleHex);
    if (decodedHex?.byteLength > 100) {
        return new Blob([decodedHex], { type: format === 'mp3' ? 'audio/mpeg' : 'audio/wav' });
    }
    return blob;
}

async function requestAudio(segment, signal) {
    const baseUrl = String(settings.baseUrl || '').trim().replace(/\/+$/, '');
    const response = await fetch(baseUrl + '/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + String(settings.apiKey || '').trim(),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(makeAudioRequestBody(settings, segment)),
        signal
    });
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        throw new Error(response.status + ' ' + (detail || response.statusText));
    }
    return responseToAudioBlob(response);
}

function waitForResume(session) {
    if (session.signal.aborted) return Promise.reject(session.signal.reason);
    if (!session.paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = callback => {
            if (settled) return;
            settled = true;
            session.signal.removeEventListener('abort', onAbort);
            session.resumeWaiters = session.resumeWaiters.filter(waiter => waiter !== onResume);
            callback();
        };
        const onResume = () => finish(resolve);
        const onAbort = () => finish(() => reject(new DOMException('Stopped', 'AbortError')));
        session.resumeWaiters.push(onResume);
        session.signal.addEventListener('abort', onAbort, { once: true });
    });
}

function waitMs(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException('Stopped', 'AbortError'));
        const cleanup = () => signal.removeEventListener('abort', onAbort);
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, milliseconds);
        const onAbort = () => {
            clearTimeout(timer);
            cleanup();
            reject(new DOMException('Stopped', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });
}

async function playPauseSegment(session, seconds, initialElapsed = 0) {
    const duration = Math.max(0, Number(seconds) || 0) * 1000;
    let elapsed = Math.min(duration, Math.max(0, Number(initialElapsed) || 0) * 1000);
    session.pauseElapsed = elapsed / 1000;
    updateAudioProgress(session);
    while (elapsed < duration) {
        await waitForResume(session);
        const started = Date.now();
        await waitMs(Math.min(duration - elapsed, 100), session.signal);
        if (!session.paused) {
            elapsed = Math.min(duration, elapsed + Date.now() - started);
            session.pauseElapsed = elapsed / 1000;
            updateAudioProgress(session);
        }
    }
    session.pauseElapsed = duration / 1000;
    updateAudioProgress(session);
}

async function playBlob(session, blob, startOffset = 0) {
    await waitForResume(session);
    if (session.signal.aborted) throw session.signal.reason ?? new DOMException('Stopped', 'AbortError');
    const url = URL.createObjectURL(blob);
    session.urls.add(url);
    const audio = session.audio;
    const cleanupUrl = () => {
        session.urls.delete(url);
        URL.revokeObjectURL(url);
    };
    try {
        audio.src = url;
        audio.load();
        await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                audio.removeEventListener('loadedmetadata', onLoaded);
                audio.removeEventListener('error', onError);
                session.signal.removeEventListener('abort', onAbort);
            };
            const finish = error => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) reject(error);
                else resolve();
            };
            const onLoaded = () => finish();
            const onError = () => finish(new Error('浏览器无法读取该音频时长'));
            const onAbort = () => finish(session.signal.reason ?? new DOMException('Stopped', 'AbortError'));
            audio.addEventListener('loadedmetadata', onLoaded, { once: true });
            audio.addEventListener('error', onError, { once: true });
            session.signal.addEventListener('abort', onAbort, { once: true });
            if (audio.readyState >= 1) finish();
        });

        const duration = Number(audio.duration);
        if (Number.isFinite(duration) && duration > 0) {
            audio.currentTime = toAudioTime(startOffset, sessionTimeline(session).durations[session.currentIndex], duration);
        }
        session.loadedSegmentIndex = session.currentIndex;
        updateAudioProgress(session);
        await waitForResume(session);
        if (session.signal.aborted) throw session.signal.reason ?? new DOMException('Stopped', 'AbortError');
        await new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                audio.removeEventListener('ended', onEnded);
                audio.removeEventListener('error', onError);
                session.signal.removeEventListener('abort', onAbort);
            };
            const finish = error => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) {
                    audio.pause();
                    reject(error);
                } else resolve();
            };
            const onEnded = () => finish();
            const onError = () => finish(new Error('浏览器无法播放该音频格式'));
            const onAbort = () => finish(session.signal.reason ?? new DOMException('Stopped', 'AbortError'));
            audio.addEventListener('ended', onEnded, { once: true });
            audio.addEventListener('error', onError, { once: true });
            session.signal.addEventListener('abort', onAbort, { once: true });
            session.audioStarted = true;
            setSessionPhase(session, 'playing', '正在播放 ' + session.kind);
            playSessionAudio(session, error => {
                if (activeSession === session) finish(error);
            });
        });
    } finally {
        cleanupUrl();
    }
}

function setProgressDisplay(player, progress, current, total) {
    const track = player.querySelector('.tavo-st-progress');
    track.value = String(progress);
    player.querySelector('.tavo-st-rail').style.setProperty('--tavo-progress', progress + '%');
    const time = formatTime(current) + ' / ' + formatTime(total);
    player.querySelector('.tavo-st-time').textContent = time;
    track.setAttribute('aria-valuetext', time);
}

function sessionTimeline(session) {
    // Freeze duration weights when playback starts. As later requests finish, the
    // total length and percentage must not shift underneath the user's thumb.
    if (!session.timeline) session.timeline = buildTimeline(session.segments, [], session.settings);
    return session.timeline;
}

function isPlayerVisible(player) {
    if (!player?.isConnected || player.getClientRects().length === 0) return false;
    for (let node = player; node && node !== document.body; node = node.parentElement) {
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return false;
    }
    return true;
}

function toAudioTime(offset, timelineDuration, audioDuration) {
    return Math.min(offset / timelineDuration * audioDuration, Math.max(0, audioDuration - 0.05));
}

function updateAudioProgress(session) {
    const audio = session.audio;
    const player = session.player;
    if (activeSession !== session || session.signal.aborted) return;
    if (!isPlayerVisible(player)) {
        stopSession('已离开聊天');
        return;
    }
    if (session.paused || player.dataset.seeking === 'true') return;
    const timeline = sessionTimeline(session);
    let offset = session.segmentOffset;
    if (session.segments[session.currentIndex]?.type === 'pause') {
        offset = session.pauseElapsed;
    } else if (session.loadedSegmentIndex === session.currentIndex && audio.duration > 0) {
        offset = audio.currentTime / audio.duration * timeline.durations[session.currentIndex];
    }
    const position = timelinePosition(timeline, session.currentIndex, offset);
    setProgressDisplay(player, position.progress, position.current, position.total);
}

function previewTimeline(player) {
    const session = activeSession;
    if (!session || session.player !== player) return;
    const track = player.querySelector('.tavo-st-progress');
    const timeline = sessionTimeline(session);
    const position = timelineTarget(timeline, Number(track.value));
    setProgressDisplay(player, Number(track.value), position.current, position.total);
}

function seekPlayback(player) {
    const session = activeSession;
    if (!session || session.player !== player || session.signal.aborted) return;
    const track = player.querySelector('.tavo-st-progress');
    const timeline = sessionTimeline(session);
    const progress = Number(track.value);
    const target = timelineTarget(timeline, progress);
    const segment = session.segments[target.index];
    setProgressDisplay(player, progress, target.current, target.total);
    setSessionPhase(session, 'loading', '正在跳转播放位置');
    if (target.index === session.currentIndex && session.audioStarted && session.loadedSegmentIndex === target.index &&
        segment?.type !== 'pause' && !session.audio.ended &&
        Number.isFinite(session.audio.duration) && session.audio.duration > 0) {
        session.audio.currentTime = toAudioTime(target.offset, timeline.durations[target.index], session.audio.duration);
        if (session.paused) togglePause(session);
        return;
    }
    session.seekTarget = { index: target.index, offset: target.offset, timeline };
    session.controller.abort(new DOMException('Seeking', 'AbortError'));
}

function stopSession(detail = '已停止') {
    const session = activeSession;
    if (!session) return;
    activeSession = null;
    session.stopped = true;
    session.controller.abort();
    session.audio.pause();
    session.audio.removeAttribute('src');
    session.audio.load();
    for (const url of session.urls) URL.revokeObjectURL(url);
    session.urls.clear();
    for (const resume of session.resumeWaiters) resume();
    delete session.player.dataset.seeking;
    setProgressDisplay(session.player, 0, 0, 0);
    updatePlayer(session.player, 'idle', detail, 0, 0);
}

function playSessionAudio(session, fail) {
    void session.audio.play().catch(error => {
        // Pausing can interrupt a pending play() before the browser starts audio.
        if (error.name !== 'AbortError') fail(error);
    });
}

function togglePause(session) {
    session.paused = !session.paused;
    if (session.paused) {
        session.audio.pause();
        setProgressDisplay(session.player, 0, 0, sessionTimeline(session).total);
        renderSession(session);
    } else {
        renderSession(session);
        updateAudioProgress(session);
        for (const resume of session.resumeWaiters.splice(0)) resume();
        if (session.audioStarted && !session.audio.ended) playSessionAudio(session, error => {
            if (activeSession === session) session.controller.abort(error);
        });
    }
}

async function startPlayback(player, messageId, forceRegenerate = false, startTarget = null) {
    const message = context.chat?.[Number(messageId)];
    const rawText = getActiveReplyText(message);
    if (!rawText.trim()) {
        notifyError('这条回复没有可朗读的文字');
        return;
    }
    if (!String(settings.apiKey || '').trim()) {
        notifyError('请先在扩展设置中填写 API Key');
        return;
    }
    if (!String(settings.baseUrl || '').trim()) {
        notifyError('请先填写语音 API 地址');
        return;
    }

    unlockAudio();
    if (activeSession?.player === player) {
        // Resuming a paused playback continues from its position.
        if (activeSession.paused) {
            togglePause(activeSession);
            return;
        }
        stopSession();
    } else if (activeSession) {
        stopSession();
    }
    if (!startTarget) setProgressDisplay(player, 0, 0, 0);

    const reading = extractReading(rawText);
    reading.readable = sanitizeReadableText(reading.clean);
    if (reading.hasStructureBlock && !reading.rows) {
        // A damaged structure block must not stop playback: fall back to the visible text.
        console.warn('Tavo Voice Player: reading structure could not be parsed, using plain text fallback');
    }
    const segments = buildAudioSegments(reading, settings);
    if (!segments.length) {
        notifyError('当前播放模式没有可朗读内容');
        return;
    }

    const controller = new AbortController();
    const audio = new Audio();
    audio.preload = 'auto';
    const session = {
        messageId: Number(messageId),
        signature: player.dataset.signature,
        player,
        audio,
        segments,
        settings,
        startTarget,
        timeline: startTarget?.timeline,
        phase: 'loading',
        title: startTarget ? '正在跳转播放位置' : '正在准备语音',
        segmentLabel: playbackModeLabel(),
        controller,
        signal: controller.signal,
        stopped: false,
        paused: false,
        resumeWaiters: [],
        urls: new Set(),
        readyCount: 0,
        total: segments.length,
        currentIndex: Math.min(startTarget?.index ?? 0, segments.length - 1),
        pauseElapsed: 0,
        segmentOffset: startTarget?.offset ?? 0,
        audioStarted: false
    };
    activeSession = session;
    audio.addEventListener('timeupdate', () => updateAudioProgress(session));
    const markPlaying = () => {
        if (!session.audioStarted || session.paused || audio.paused || audio.seeking) return;
        setSessionPhase(session, 'playing', '正在播放 ' + session.kind);
        updateAudioProgress(session);
    };
    audio.addEventListener('playing', markPlaying);
    audio.addEventListener('seeked', markPlaying);
    audio.addEventListener('waiting', () => {
        if (session.audioStarted && !session.paused && !audio.seeking && !audio.ended) {
            setSessionPhase(session, 'loading', '正在衔接下一段');
        }
    });
    renderSession(session);

    let seekRestart = null;
    try {
        await playInOrder(
            segments,
            async (segment, index, signal) => {
                if (segment.type === 'pause') return null;
                const key = await hashText(cacheMaterial(segment));
                if (!forceRegenerate) {
                    try {
                        const cached = await readAudioCache(key);
                        if (cached) return cached;
                    } catch (error) {
                        console.debug('Tavo Voice Player: cache read failed', error);
                    }
                }
                const generated = await requestAudio(segment, signal);
                try {
                    await storeGeneratedAudio(key, generated);
                } catch (error) {
                    console.debug('Tavo Voice Player: cache write failed', error);
                }
                return generated;
            },
            async (blob, segment, index) => {
                if (session.stopped || activeSession !== session) throw new DOMException('Stopped', 'AbortError');
                session.currentIndex = index;
                const offset = session.startTarget?.index === index ? session.startTarget.offset : 0;
                session.startTarget = null;
                session.pauseElapsed = offset;
                session.segmentOffset = offset;
                session.kind = segment.kind === 'narrator' ? '旁白' : '对话';
                session.segmentLabel = session.kind + ' ' + (index + 1) + '/' + segments.length;
                await waitForResume(session);
                if (segment.type === 'pause') {
                    setSessionPhase(session, 'playing', '正在播放 ' + session.kind);
                    await playPauseSegment(session, segment.seconds, offset);
                } else {
                    await playBlob(session, blob, offset);
                }
                session.audioStarted = false;
                updateAudioProgress(session);
                if (index + 1 < segments.length) setSessionPhase(session, 'loading', '正在衔接下一段');
            },
            {
                concurrency: 10,
                startIndex: session.currentIndex,
                signal: controller.signal,
                onError: error => controller.abort(error),
                onReady: () => {
                    if (activeSession !== session || session.signal.aborted) return;
                    updateReadyCount(player, ++session.readyCount, segments.length);
                }
            }
        );
        if (activeSession === session) {
            activeSession = null;
            setProgressDisplay(player, 0, 0, 0);
            updatePlayer(player, 'idle', '播放完成', 0, 0);
        }
    } catch (error) {
        if (activeSession === session) {
            if (session.seekTarget) {
                seekRestart = session.seekTarget;
                activeSession = null;
            } else {
                activeSession = null;
                session.controller.abort();
                const stopped = error?.name === 'AbortError';
                updatePlayer(player, 'idle', stopped ? '已停止' : '播放失败', session.readyCount, segments.length);
                if (!stopped) {
                    const detail = error instanceof TypeError
                        ? '网络请求失败，请检查 API 地址和跨域 CORS 设置'
                        : String(error?.message || error);
                    notifyError(detail);
                }
            }
        }
    } finally {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        for (const url of session.urls) URL.revokeObjectURL(url);
        session.urls.clear();
    }
    if (seekRestart) await startPlayback(player, messageId, forceRegenerate, seekRestart);
}

function handlePlayerAction(event) {
    const button = event.target.closest('[data-action]');
    const player = button?.closest('.tavo-st-player');
    if (!button || !player) return;
    const action = button.dataset.action;
    const messageId = player.dataset.messageId;
    event.preventDefault();

    if (action === 'menu') {
        const menu = player.querySelector('.tavo-st-menu');
        menu.hidden = !menu.hidden;
        button.setAttribute('aria-expanded', String(!menu.hidden));
        return;
    }
    if (action === 'play') {
        if (activeSession?.player === player) {
            togglePause(activeSession);
            return;
        }
        void startPlayback(player, messageId);
        return;
    }
    if (action === 'stop') {
        player.querySelector('.tavo-st-menu').hidden = true;
        if (activeSession?.player === player) stopSession();
        return;
    }
    if (action === 'regenerate') {
        player.querySelector('.tavo-st-menu').hidden = true;
        if (activeSession) stopSession();
        void startPlayback(player, messageId, true);
        return;
    }
    if (action === 'clear-cache') {
        player.querySelector('.tavo-st-menu').hidden = true;
        void clearAudioCache().then(() => updatePlayer(player, 'idle', '音频缓存已清空', 0, 0));
    }
}

function handleSwipe(messageId) {
    if (activeSession?.messageId === Number(messageId)) stopSession('切换了回复');
    setTimeout(() => refreshMessagePlayer(messageId), 0);
}

async function initialize() {
    await loadPromptDefaults();
    updatePromptInjection();
    try {
        await loadSettingsPanel();
    } catch (error) {
        console.error('Tavo Voice Player: settings panel failed to load', error);
    }
    const eventTypes = context.eventTypes || {};
    if (context.eventSource && eventTypes.CHARACTER_MESSAGE_RENDERED) {
        context.eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, messageId => refreshMessagePlayer(messageId));
        context.eventSource.on(eventTypes.MESSAGE_SWIPED, handleSwipe);
        context.eventSource.on(eventTypes.MESSAGE_UPDATED, messageId => refreshMessagePlayer(messageId));
        context.eventSource.on(eventTypes.MESSAGE_DELETED, () => {
            if (activeSession) stopSession('消息已删除');
            setTimeout(refreshAllPlayers, 0);
        });
        context.eventSource.on(eventTypes.CHAT_CHANGED, () => {
            if (activeSession) stopSession('切换了聊天');
            updatePromptInjection();
            setTimeout(refreshAllPlayers, 0);
        });
    }
    document.addEventListener('click', handlePlayerAction);

    const stopWhenLeaving = () => {
        if (activeSession) stopSession('已停止');
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') stopWhenLeaving();
    });
    window.addEventListener('pagehide', stopWhenLeaving);
    window.addEventListener('beforeunload', stopWhenLeaving);
    window.addEventListener('popstate', stopWhenLeaving);
    if (eventTypes.CHAT_DELETED || eventTypes.GROUP_CHAT_DELETED) {
        const handleChatDeleted = () => {
            if (activeSession) stopSession('聊天已关闭');
            setTimeout(refreshAllPlayers, 0);
        };
        if (eventTypes.CHAT_DELETED) context.eventSource.on(eventTypes.CHAT_DELETED, handleChatDeleted);
        if (eventTypes.GROUP_CHAT_DELETED) context.eventSource.on(eventTypes.GROUP_CHAT_DELETED, handleChatDeleted);
    }

    // TauriTavern can hide the chat view without firing CHAT_CHANGED or a document
    // visibility change. If the active player leaves the DOM, audio must stop.
    const lifecycleObserver = new MutationObserver(() => {
        const player = activeSession?.player;
        if (player && !isPlayerVisible(player)) stopSession('已离开聊天');
    });
    lifecycleObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });

    refreshAllPlayers();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void initialize(); }, { once: true });
} else {
    void initialize();
}
