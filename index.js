import {
    DEFAULT_PROMPT,
    MODULE_NAME,
    PROMPT_KEY,
    buildAudioSegments,
    extractReading,
    formatTime,
    getActiveReplyText,
    makeAudioRequestBody,
    playInOrder,
    sanitizeReadableText,
    stripReadingBlocks
} from './core.js';

const DEFAULT_SETTINGS = {
    baseUrl: 'https://www.nengpa.com/v1',
    apiKey: '',
    model: 'speech-2.8-hd',
    playbackMode: 'all',
    narratorVoice: 'moss_audio_46b3651e-a85e-11f1-8957-ba6628da9bfd',
    dialogueVoice: 'moss_audio_1d309c5c-a1ff-11f1-acee-26b6a8502990',
    audioFormat: 'wav',
    sampleRate: 32000,
    speed: 1,
    dialogueSpeed: 1,
    languageBoost: 'Chinese',
    contextHideStructure: true,
    voices: {
        protagonist: 'moss_audio_cbb39430-a862-11f1-aa1d-d2651eedd987',
        heroine: 'moss_audio_499a9275-a861-11f1-b7bb-b695f68c934a',
        maleNpc: 'moss_audio_cbb39430-a862-11f1-aa1d-d2651eedd987',
        femaleNpc: 'moss_audio_499a9275-a861-11f1-b7bb-b695f68c934a'
    },
    promptEnabled: false,
    promptPosition: 0,
    promptRole: 0,
    promptDepth: 4,
    prompt: DEFAULT_PROMPT
};

const context = globalThis.SillyTavern?.getContext?.();
if (!context) {
    console.error('Tavo Voice Player: SillyTavern context is unavailable.');
    throw new Error('SillyTavern context is unavailable');
}

const settings = mergeSettings(DEFAULT_SETTINGS, context.extensionSettings[MODULE_NAME]);
context.extensionSettings[MODULE_NAME] = settings;

let settingsPanel;
let activeSession = null;
let audioContext;
const memoryAudioCache = new Map();
const activeCacheWrites = new Set();

function mergeSettings(defaults, stored) {
    const result = { ...defaults, ...(stored || {}) };
    result.voices = { ...defaults.voices, ...(stored?.voices || {}) };
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
    return String(settings.prompt || DEFAULT_PROMPT)
        .replaceAll('{{OPEN_MARKER}}', open)
        .replaceAll('{{CLOSE_MARKER}}', close);
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
    bindSettingsPanel();
    syncSettingsPanel();
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
            settings.prompt = DEFAULT_PROMPT;
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

function createPlayer() {
    const root = document.createElement('div');
    root.className = 'tavo-st-player';
    root.dataset.state = 'idle';
    root.innerHTML = [
        '<button class="tavo-st-play" type="button" data-action="play" title="播放" aria-label="播放">',
        '<i class="fa-solid fa-play" aria-hidden="true"></i></button>',
        '<div class="tavo-st-body">',
        '<div class="tavo-st-head"><span class="tavo-st-title">Tavo 朗读</span><span class="tavo-st-time">0:00 / 0:00</span></div>',
        '<input class="tavo-st-progress" type="range" min="0" max="100" step="0.1" value="0" aria-label="当前句进度">',
        '<div class="tavo-st-foot"><span class="tavo-st-detail">点击播放</span><span class="tavo-st-ready"></span></div>',
        '</div>',
        '<button class="tavo-st-more" type="button" data-action="menu" title="更多操作" aria-label="更多操作" aria-expanded="false">',
        '<i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>',
        '<div class="tavo-st-menu" hidden>',
        '<button type="button" data-action="stop">停止</button>',
        '<button type="button" data-action="regenerate">重新生成</button>',
        '<button type="button" data-action="clear-cache">清空音频缓存</button>',
        '</div>'
    ].join('');
    root.querySelector('.tavo-st-progress').addEventListener('input', event => {
        if (activeSession?.player !== root) return;
        const audio = activeSession.audio;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
            audio.currentTime = audio.duration * Number(event.target.value) / 100;
        }
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
    let player = block.querySelector('.tavo-st-player');
    if (!player) {
        player = createPlayer();
        block.append(player);
    }
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

function updatePlayer(player, state, detail, ready, total) {
    if (!player?.isConnected) return;
    player.dataset.state = state;
    const button = player.querySelector('.tavo-st-play');
    const icon = button.querySelector('i');
    const paused = state === 'paused';
    icon.className = 'fa-solid ' + (state === 'playing' ? 'fa-pause' : (paused ? 'fa-play' : 'fa-play'));
    button.title = state === 'playing' ? '暂停' : (paused ? '继续播放' : '播放');
    button.setAttribute('aria-label', button.title);
    player.querySelector('.tavo-st-detail').textContent = detail || '点击播放';
    player.querySelector('.tavo-st-ready').textContent = total ? '已就绪 ' + ready + '/' + total : '';
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
    if (session.stopped) return Promise.reject(new DOMException('Stopped', 'AbortError'));
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

async function playPauseSegment(session, seconds) {
    let remaining = Math.max(0, Number(seconds) || 0) * 1000;
    while (remaining > 0) {
        await waitForResume(session);
        const started = Date.now();
        await waitMs(Math.min(remaining, 100), session.signal);
        if (!session.paused) remaining -= Date.now() - started;
    }
}

async function playBlob(session, blob) {
    await waitForResume(session);
    const url = URL.createObjectURL(blob);
    session.urls.add(url);
    const audio = session.audio;
    audio.src = url;
    audio.currentTime = 0;

    await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            audio.removeEventListener('ended', onEnded);
            audio.removeEventListener('error', onError);
            session.signal.removeEventListener('abort', onAbort);
            session.urls.delete(url);
            URL.revokeObjectURL(url);
        };
        const finish = error => {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve();
        };
        const onEnded = () => finish();
        const onError = () => finish(new Error('浏览器无法播放该音频格式'));
        const onAbort = () => finish(new DOMException('Stopped', 'AbortError'));
        audio.addEventListener('ended', onEnded, { once: true });
        audio.addEventListener('error', onError, { once: true });
        session.signal.addEventListener('abort', onAbort, { once: true });
        audio.play().catch(finish);
    });
}

function updateAudioProgress(session) {
    const audio = session.audio;
    const player = session.player;
    if (!player?.isConnected) return;
    const track = player.querySelector('.tavo-st-progress');
    const time = player.querySelector('.tavo-st-time');
    const duration = Number(audio.duration) || 0;
    const current = Number(audio.currentTime) || 0;
    track.value = duration > 0 ? String(current / duration * 100) : '0';
    time.textContent = formatTime(current) + ' / ' + formatTime(duration);
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
    updatePlayer(session.player, 'idle', detail, session.readyCount, session.total);
}

function togglePause(session) {
    session.paused = !session.paused;
    if (session.paused) {
        session.audio.pause();
        updatePlayer(session.player, 'paused', '已暂停', session.readyCount, session.total);
    } else {
        for (const resume of session.resumeWaiters.splice(0)) resume();
        if (session.audio.src && session.audio.paused) {
            void session.audio.play().catch(error => notifyError(error.message));
        }
        updatePlayer(session.player, 'playing', '正在播放', session.readyCount, session.total);
    }
}

async function startPlayback(player, messageId, forceRegenerate = false) {
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
    if (activeSession) stopSession();

    const reading = extractReading(rawText);
    reading.readable = sanitizeReadableText(reading.clean);
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
        controller,
        signal: controller.signal,
        stopped: false,
        paused: false,
        resumeWaiters: [],
        urls: new Set(),
        readyCount: 0,
        total: segments.length,
        currentIndex: 0
    };
    activeSession = session;
    audio.addEventListener('timeupdate', () => updateAudioProgress(session));
    audio.addEventListener('loadedmetadata', () => updateAudioProgress(session));
    updatePlayer(player, 'loading', '正在准备音频', 0, segments.length);

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
                const label = (segment.kind === 'narrator' ? '旁白' : '对白') + ' ' + (index + 1) + '/' + segments.length;
                updatePlayer(player, session.paused ? 'paused' : 'playing', label, session.readyCount, segments.length);
                if (segment.type === 'pause') await playPauseSegment(session, segment.seconds);
                else await playBlob(session, blob);
            },
            {
                concurrency: 10,
                signal: controller.signal,
                onError: error => controller.abort(error),
                onReady: () => {
                    if (activeSession !== session) return;
                    session.readyCount++;
                    const detail = player.querySelector('.tavo-st-detail')?.textContent || '正在加载后续音频';
                    updatePlayer(player, activeSession === session && session.paused ? 'paused' : 'playing',
                        detail, session.readyCount, segments.length);
                }
            }
        );
        if (activeSession === session) {
            activeSession = null;
            updatePlayer(player, 'idle', '播放完成', session.readyCount, segments.length);
            player.querySelector('.tavo-st-time').textContent = '0:00 / 0:00';
            player.querySelector('.tavo-st-progress').value = '0';
        }
    } catch (error) {
        if (activeSession === session) {
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
    } finally {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        for (const url of session.urls) URL.revokeObjectURL(url);
        session.urls.clear();
    }
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
    refreshAllPlayers();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void initialize(); }, { once: true });
} else {
    void initialize();
}
