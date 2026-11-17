export const MODULE_NAME = 'tavo_voice_player';
export const PROMPT_KEY = 'tavo_voice_player_reading_rules';

export const DEFAULT_PROMPT = [
    '【朗读结构规则】',
    '正常完成角色扮演回复后，在回复末尾追加一个机器可读的朗读结构块。它只供朗读扩展使用，不能改变正文、剧情、人设或语气，也不能把规则原文写进正文。',
    '结构块使用 {{OPEN_MARKER}} 开始，使用 {{CLOSE_MARKER}} 结束；块内只能是严格 JSON 数组，不要使用 Markdown 围栏。',
    '每条记录包含 role_name、text_content、emotion_name、strength_name、minimax_segments。role_name 只能是旁白、主角、女主、男NPC、女NPC、未知角色。strength_name 固定为空字符串。',
    '结合角色卡、用户人设和聊天上下文判断说话人；不要默认把用户当成主角。已明确的主角姓名标为主角，已明确的女主姓名标为女主。',
    '旁白和对白按原文顺序拆开。text_content 与该条所有 text 片段拼接结果必须完全一致；所有 text_content 拼接后必须保留正文全部文字和顺序，仅可去掉对白最外层引号。不要输出空记录。',
    '每个 minimax_segments 片段为 text、sound 或 pause。text 必须包含 emotion，使用 happy、sad、angry、fearful、disgusted、surprised、calm 或 null。sound 标签限于 emm、laughs、chuckle、humming、coughs、clear-throat、breath、inhale、exhale、pant、sighs、gasps、sniffs、groans、burps、lip-smacking、sneezes、snorts、hissing。pause 只用于正文明确要求的句中停顿。',
    '旁白只能使用普通 text，不能添加 emotion、sound 或 pause。角色情绪和声音只属于对应对白；没有明确依据时使用 null，不要从上一句继承。',
    '排除代码、HTML、状态栏、变量更新、Analysis、UpdateVariable、StatusPlaceHolderImpl 和 [[INSIDE]] 控制块。结构块之外不要输出朗读规则或自检说明。',
    '结构块应使用以下形状：[{\"role_name\":\"旁白\",\"text_content\":\"原文\",\"emotion_name\":\"\",\"strength_name\":\"\",\"minimax_segments\":[{\"type\":\"text\",\"text\":\"原文\",\"emotion\":null}]}]'
].join('\n');

const BLOCK_PATTERNS = [
    /<!--\s*MINIMAX_TTS\b[\s\S]*?-->/gi,
    /\[\[MINIMAX_TTS\]\][\s\S]*?\[\[\/MINIMAX_TTS\]\]/gi
];

const SOUND_TAGS = new Set([
    'emm', 'laughs', 'chuckle', 'humming', 'coughs', 'clear-throat', 'breath',
    'inhale', 'exhale', 'pant', 'sighs', 'gasps', 'sniffs', 'groans', 'burps',
    'lip-smacking', 'sneezes', 'snorts', 'hissing'
]);

function allMatches(regex, text) {
    const matches = [];
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
        matches.push(match);
        if (!match[0].length) regex.lastIndex++;
    }
    return matches;
}

function extractRawBlock(text) {
    const matches = [
        ...allMatches(BLOCK_PATTERNS[0], text),
        ...allMatches(BLOCK_PATTERNS[1], text)
    ].sort((a, b) => b.index - a.index);
    if (!matches.length) return null;

    const match = matches[0];
    let raw = match[0];
    if (raw.startsWith('<!--')) {
        raw = raw.replace(/^<!--\s*MINIMAX_TTS\s*/i, '').replace(/\s*-->$/, '');
    } else {
        raw = raw.replace(/^\[\[MINIMAX_TTS\]\]\s*/i, '').replace(/\s*\[\[\/MINIMAX_TTS\]\]$/, '');
    }
    return { raw: raw.trim(), start: match.index, end: match.index + match[0].length };
}

export function stripReadingBlocks(value) {
    let text = String(value ?? '');
    for (const pattern of BLOCK_PATTERNS) {
        pattern.lastIndex = 0;
        text = text.replace(pattern, '');
    }
    return text;
}

export function getActiveReplyText(message) {
    if (typeof message?.mes === 'string') return message.mes;
    if (Array.isArray(message?.swipes)) {
        const selected = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        return typeof message.swipes[selected] === 'string' ? message.swipes[selected] : '';
    }
    return '';
}

function parseRows(raw) {
    let rows;
    try {
        rows = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) return null;

    for (const row of rows) {
        if (!row || typeof row !== 'object' ||
            typeof row.role_name !== 'string' ||
            typeof row.text_content !== 'string' ||
            !Array.isArray(row.minimax_segments)) return null;

        let joinedText = '';
        for (const part of row.minimax_segments) {
            if (!part || typeof part !== 'object') return null;
            if (part.type === 'text') {
                if (typeof part.text !== 'string' ||
                    !(part.emotion === null || typeof part.emotion === 'string')) return null;
                joinedText += part.text;
            } else if (part.type === 'sound') {
                if (!SOUND_TAGS.has(part.tag)) return null;
            } else if (part.type === 'pause') {
                if (!Number.isFinite(part.seconds) || part.seconds < 0.01 || part.seconds > 99.99) return null;
            } else {
                return null;
            }
        }
        if (joinedText !== row.text_content) return null;
    }
    return rows;
}

export function extractReading(value) {
    const source = String(value ?? '');
    const block = extractRawBlock(source);
    const rows = block ? parseRows(block.raw) : null;
    const clean = stripReadingBlocks(source).trimEnd();
    return { rows, clean, readable: clean };
}

export function sanitizeReadableText(value) {
    return stripReadingBlocks(value)
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\x60{3}[\s\S]*?\x60{3}/g, ' ')
        .replace(/\[\[(?:INSIDE|\/INSIDE|STATUS|\/STATUS)[^\]]*\]\]/gi, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

export function splitSentences(value) {
    const text = String(value ?? '');
    const chunks = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const boundary = /[\r\n。！？!?…]/u.test(char) ||
            (char === '.' && !(i > 0 && i + 1 < text.length && /\d/.test(text[i - 1]) && /\d/.test(text[i + 1])));
        if (!boundary) continue;
        let end = i + 1;
        if (/[。！？!?…]/u.test(char) || char === '.') {
            while (end < text.length && /[。！？!?…\.]/u.test(text[end])) end++;
        }
        const chunk = text.slice(start, end).trim();
        if (chunk) chunks.push(chunk);
        start = end;
        i = end - 1;
    }
    const tail = text.slice(start).trim();
    if (tail) chunks.push(tail);
    return chunks;
}

function fallbackRows(text) {
    const rows = [];
    const quotePattern = /([“「『])([\s\S]*?)([”」』])|"([^"\n]+)"|'([^'\n]+)'/g;
    let last = 0;
    let match;
    while ((match = quotePattern.exec(text)) !== null) {
        const before = text.slice(last, match.index);
        if (before.trim()) rows.push({ role_name: '旁白', text_content: before });
        const dialogue = match[2] ?? match[4] ?? match[5] ?? '';
        if (dialogue.trim()) rows.push({ role_name: '未知角色', text_content: dialogue });
        last = match.index + match[0].length;
    }
    const tail = text.slice(last);
    if (tail.trim()) rows.push({ role_name: '旁白', text_content: tail });
    return rows.length ? rows : [{ role_name: '旁白', text_content: text }];
}

function roleKind(role) {
    return role === '旁白' ? 'narrator' : 'dialogue';
}

function getRoleVoice(role, settings) {
    const voices = settings.voices || {};
    if (role === '主角') return voices.protagonist || settings.dialogueVoice;
    if (role === '女主') return voices.heroine || settings.dialogueVoice;
    if (role === '男NPC') return voices.maleNpc || settings.dialogueVoice;
    if (role === '女NPC') return voices.femaleNpc || settings.dialogueVoice;
    return role === '旁白' ? settings.narratorVoice : settings.dialogueVoice;
}

function textChunksForRow(row) {
    if (!Array.isArray(row.minimax_segments)) {
        return splitSentences(row.text_content).map(text => ({ type: 'text', text, emotion: null }));
    }
    const chunks = [];
    let current = null;
    let pendingSound = '';
    for (const part of row.minimax_segments) {
        if (part.type === 'pause') {
            current = null;
            chunks.push({ type: 'pause', seconds: part.seconds });
        } else if (part.type === 'sound') {
            pendingSound += '(' + part.tag + ')';
        } else if (part.type === 'text') {
            if (current && current.emotion === part.emotion) {
                current.text += pendingSound + part.text;
            } else {
                current = { type: 'text', text: pendingSound + part.text, emotion: part.emotion };
                chunks.push(current);
            }
            pendingSound = '';
        }
    }
    if (pendingSound && chunks.length && chunks[chunks.length - 1].type === 'text') {
        chunks[chunks.length - 1].text += pendingSound;
    }
    return chunks.flatMap(chunk => {
        if (chunk.type === 'pause') return [chunk];
        return splitSentences(chunk.text).map(text => ({ ...chunk, text }));
    });
}

export function buildAudioSegments(reading, settings) {
    const text = sanitizeReadableText(reading?.readable ?? reading?.clean ?? '');
    let rows = reading?.rows;
    if (!Array.isArray(rows) || !rows.length) rows = fallbackRows(text);

    const segments = [];
    for (const row of rows) {
        const kind = roleKind(row.role_name);
        if (settings.playbackMode === 'narrator' && kind !== 'narrator') continue;
        if (settings.playbackMode === 'dialogue' && kind !== 'dialogue') continue;
        const voice = getRoleVoice(row.role_name, settings);
        for (const chunk of textChunksForRow(row)) {
            if (chunk.type === 'pause') {
                segments.push({ type: 'pause', seconds: chunk.seconds, kind, role: row.role_name });
                continue;
            }
            if (!chunk.text.trim()) continue;
            segments.push({
                type: 'audio',
                text: chunk.text,
                kind,
                role: row.role_name,
                voice: voice || settings.dialogueVoice || settings.narratorVoice,
                speed: kind === 'narrator' ? settings.speed : settings.dialogueSpeed,
                emotion: chunk.emotion || null
            });
        }
    }
    return segments;
}

export function makeAudioRequestBody(settings, segment) {
    const voice = segment.voice || settings.dialogueVoice || settings.narratorVoice;
    const speed = Number(segment.speed ?? settings.dialogueSpeed) || 1;
    return {
        model: settings.model,
        input: segment.text,
        voice,
        response_format: 'hex',
        speed,
        metadata: {
            language_boost: settings.languageBoost,
            voice_setting: {
                voice_id: voice,
                speed,
                vol: 1,
                pitch: 0,
                ...(segment.emotion ? { emotion: segment.emotion } : {})
            },
            audio_setting: {
                sample_rate: Number(settings.sampleRate) || 32000,
                format: settings.audioFormat || 'wav',
                channel: 1
            }
        }
    };
}

function raceAbort(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', abort, { once: true });
        promise.then(
            value => {
                signal.removeEventListener('abort', abort);
                resolve(value);
            },
            error => {
                signal.removeEventListener('abort', abort);
                reject(error);
            }
        );
    });
}

export async function playInOrder(items, load, play, options = {}) {
    const limit = Math.max(1, Math.min(10, Number(options.concurrency) || 10));
    const signal = options.signal;
    const slots = items.map(() => {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        promise.catch(() => {});
        return { promise, resolve, reject };
    });
    let next = 0;
    let active = 0;
    let failure = null;

    const fail = error => {
        if (failure) return;
        failure = error;
        options.onError?.(error);
        for (const slot of slots) slot.reject(error);
    };

    const pump = () => {
        while (!failure && !signal?.aborted && active < limit && next < items.length) {
            const index = next++;
            active++;
            Promise.resolve()
                .then(() => load(items[index], index, signal))
                .then(value => {
                    if (failure || signal?.aborted) return;
                    options.onReady?.(index, value);
                    slots[index].resolve(value);
                })
                .catch(error => {
                    if (!signal?.aborted) fail(error);
                    slots[index].reject(failure ?? error);
                })
                .finally(() => {
                    active--;
                    pump();
                });
        }
    };

    pump();
    for (let index = 0; index < items.length; index++) {
        const value = await raceAbort(slots[index].promise, signal);
        try {
            await raceAbort(Promise.resolve(play(value, items[index], index)), signal);
        } catch (error) {
            if (!signal?.aborted) fail(error);
            throw failure ?? error;
        }
    }
}

export function formatTime(seconds) {
    const value = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}
