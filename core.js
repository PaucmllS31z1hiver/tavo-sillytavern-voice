export const MODULE_NAME = 'tavo_voice_player';
export const PROMPT_KEY = 'tavo_voice_player_reading_rules';
export const VERSION = '0.3.2';

export const SAME_ROLE_PROMPT_RULE = '【同角色连续内容合并】同一个 role_name 的连续正文必须合并：同一角色连续多行、连续多个句子，只能生成同一条记录；同一角色同一情绪下的连续 text 必须合并成一个 text 片段，text_content 要原样保留所有换行和标点。只有角色变化、情绪变化、明确的 pause，或明确的声音/动作边界才能新开记录或片段。不得因为换行、句号或句子数量，把同一角色拆成多条记录或多次语音合成。';
export const DIALOGUE_TONE_PROMPT_RULE = '【对白语气标签】对白应结合正文、人物状态和上下文主动选择合适的声音标签，并鼓励多用，让朗读有明显变化。“鼓励多用”不是每句固定添加，而是只要上下文已经提供了合理依据，就优先考虑添加合适标签；正文没有直接写“笑了”也不代表不能使用语气。例如上下文明显欢快、人物正在打趣、气氛轻松时，可以使用 chuckle 或 laughs；无奈、释然、疲惫时可以使用 sighs；尴尬开口时可以使用 clear-throat；紧张或急促时可以使用 breath、inhale、exhale 或 pant；惊讶时可以使用 gasps；冷淡嘲讽时可以使用 snorts 或 hissing。明确出现笑了、笑出声、哈哈哈、咳嗽、清嗓、叹气、喘气、吸气、倒吸气、哼唱、冷哼、惊呼等实际声音时，必须在对应对白附近添加匹配标签。声音标签只放在对白的 minimax_segments 中，不得写进 text，不得修改正文，不得让旁白音色发出角色声音。声音标签不等于 emotion，不能因为使用 laughs 或 chuckle 就自动设置 happy，也不能因为使用 sighs 就自动设置 sad。没有场景依据时不添加，同一声音事件不重复添加。';

export const DEFAULT_PROMPT = [
    '【朗读结构规则】',
    '正常完成角色扮演回复后，在回复末尾追加一个机器可读的朗读结构块。它只供朗读扩展使用，不能改变正文、剧情、人设或语气，也不能把规则原文写进正文。',
    '结构块使用 {{OPEN_MARKER}} 开始，使用 {{CLOSE_MARKER}} 结束；块内只能是严格 JSON 数组，不要使用 Markdown 围栏。',
    '每条记录包含 role_name、text_content、emotion_name、strength_name、minimax_segments。role_name 只能是旁白、主角、女主一、女主二、女主三、女主四、男NPC一、男NPC二、女NPC一、女NPC二、未知角色。strength_name 固定为空字符串。',
    '结合角色卡、用户人设和聊天上下文判断说话人；不要默认把用户当成主角。主角姓名标为主角；女主姓名对应女主一，有多位女主时按角色卡身份对应女主二至女主四。NPC 必须判断性别：男性使用男NPC一或男NPC二，女性使用女NPC一或女NPC二，禁止使用无性别的 NPC一、NPC二。第五位及以后的女主使用女主四；第三位及以后的男性 NPC 使用男NPC二；第三位及以后的女性 NPC 使用女NPC二。',
    '旁白和对白按原文顺序拆开。text_content 与该条所有 text 片段拼接结果必须完全一致；所有 text_content 拼接后必须保留正文全部文字和顺序，仅可去掉对白最外层引号。不要输出空记录。',
    SAME_ROLE_PROMPT_RULE,
    DIALOGUE_TONE_PROMPT_RULE,
    '每个 minimax_segments 片段为 text、sound 或 pause。text 必须包含 emotion，使用 happy、sad、angry、fearful、disgusted、surprised、calm 或 null。sound 标签限于 emm、laughs、chuckle、humming、coughs、clear-throat、breath、inhale、exhale、pant、sighs、gasps、sniffs、groans、burps、lip-smacking、sneezes、snorts、hissing。pause 只用于正文明确要求的句中停顿。',
    '旁白只能使用普通 text，不能添加 emotion、sound 或 pause。角色情绪和声音只属于对应对白；没有明确依据时使用 null，不要从上一句继承。',
    '排除代码、HTML、状态栏、变量更新、Analysis、UpdateVariable、StatusPlaceHolderImpl 和 [[INSIDE]] 控制块。结构块之外不要输出朗读规则或自检说明。',
    '结构块应使用以下形状：[{\"role_name\":\"旁白\",\"text_content\":\"原文\",\"emotion_name\":\"\",\"strength_name\":\"\",\"minimax_segments\":[{\"type\":\"text\",\"text\":\"原文\",\"emotion\":null}]}]'
].join('\n');

export function mergeVoiceSettings(defaultVoices, stored = {}) {
    const saved = stored?.voices || {};
    // A blank old value must not erase the new defaults; only concrete choices override.
    const concrete = Object.fromEntries(Object.entries(saved)
        .filter(([, value]) => String(value ?? '').trim()));
    const result = { ...defaultVoices, ...concrete };
    const pick = (...keys) => keys.map(key => String(saved[key] || '').trim()).find(Boolean) || '';
    const narrator = pick('narrator', 'narratorVoice') || stored?.narratorVoice;
    const protagonist = pick('protagonist') || stored?.protagonistVoice;
    const heroineBase = pick('heroine1', 'heroine') || stored?.heroineVoice;
    const dialogue = pick('dialogueVoice') || stored?.dialogueVoice;
    const maleNpc = pick('maleNpc1', 'maleNpc') || stored?.maleNpcVoice;
    const femaleNpc = pick('femaleNpc1', 'femaleNpc') || stored?.femaleNpcVoice;

    if (narrator) result.narrator = narrator;
    if (protagonist) result.protagonist = protagonist;
    if (heroineBase) result.heroine1 = heroineBase;
    for (const key of ['heroine2', 'heroine3', 'heroine4', 'maleNpc2', 'femaleNpc2']) {
        if (pick(key)) result[key] = pick(key);
    }
    if (maleNpc) result.maleNpc1 = maleNpc;
    if (femaleNpc) result.femaleNpc1 = femaleNpc;
    if (!pick('heroine2') && dialogue) result.heroine2 = dialogue;
    if (!pick('heroine3') && dialogue) result.heroine3 = dialogue;
    if (!pick('heroine4') && dialogue) result.heroine4 = dialogue;
    if (!pick('maleNpc2') && dialogue) result.maleNpc2 = dialogue;
    if (!pick('femaleNpc2') && dialogue) result.femaleNpc2 = dialogue;
    return result;
}

export function migratePromptSettings(settings, stored, defaults, legacyDefault) {
    const source = stored || {};
    const defaultPrompt = String(defaults.prompt || [defaults.split, defaults.performance]
        .filter(Boolean).join('\n\n')).trim();
    const combined = [source.promptSplit, source.promptPerformance]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join('\n\n');
    let prompt = String(settings.prompt || source.prompt || '').trim();

    if (!prompt) prompt = combined;
    if (!prompt) prompt = String(legacyDefault || '').trim() || defaultPrompt;
    if (String(legacyDefault || '').trim() && prompt === String(legacyDefault || '').trim()) {
        prompt = defaultPrompt;
    }
    if (String(source.prompt || '').trim() === String(legacyDefault || '').trim()) {
        prompt = defaultPrompt;
    }

    const previousPromptVersion = Number(source.promptMigrationVersion) || 0;
    settings.prompt = prompt || defaultPrompt;
    const additions = [];
    if (previousPromptVersion < 4 && !settings.prompt.includes('【同角色连续内容合并】')) {
        additions.push(SAME_ROLE_PROMPT_RULE);
    }
    if (previousPromptVersion < 5 && !settings.prompt.includes('【对白语气标签】')) {
        additions.push(DIALOGUE_TONE_PROMPT_RULE);
    }
    if (additions.length) {
        settings.prompt = [settings.prompt, ...additions].filter(Boolean).join('\n\n');
    }
    settings.promptMigrationVersion = 5;
    return settings;
}

const BLOCK_PATTERNS = [
    /<!--\s*MINIMAX_TTS\b[\s\S]*?-->/gi,
    /\[\[MINIMAX_TTS\]\][\s\S]*?\[\[\/MINIMAX_TTS\]\]/gi
];

const SOUND_TAGS = new Set([
    'emm', 'laughs', 'chuckle', 'humming', 'coughs', 'clear-throat', 'breath',
    'inhale', 'exhale', 'pant', 'sighs', 'gasps', 'sniffs', 'groans', 'burps',
    'lip-smacking', 'sneezes', 'snorts', 'hissing'
]);
const EMOTIONS = new Set(['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm']);
const EMOTION_NAMES = {
    '高兴': 'happy', '开心': 'happy', '伤心': 'sad', '悲伤': 'sad',
    '生气': 'angry', '愤怒': 'angry', '害怕': 'fearful', '恐惧': 'fearful',
    '厌恶': 'disgusted', '惊喜': 'surprised', '平静': 'calm'
};

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

function blockPayload(value) {
    let raw = String(value ?? '');
    if (raw.startsWith('<!--')) {
        raw = raw.replace(/^<!--\s*MINIMAX_TTS\s*/i, '').replace(/\s*-->$/, '');
    } else {
        raw = raw.replace(/^\[\[MINIMAX_TTS\]\]\s*/i, '').replace(/\s*\[\[\/MINIMAX_TTS\]\]$/, '');
    }
    return raw.trim();
}

function extractRawBlocks(text) {
    const matches = [
        ...allMatches(BLOCK_PATTERNS[0], text),
        ...allMatches(BLOCK_PATTERNS[1], text)
    ].sort((a, b) => b.index - a.index);
    return matches.map(match => ({
        raw: blockPayload(match[0]),
        start: match.index,
        end: match.index + match[0].length
    }));
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

function parseJsonValue(raw) {
    const source = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        return JSON.parse(source);
    } catch {}

    for (let start = 0; start < source.length; start++) {
        if (source[start] !== '[' && source[start] !== '{') continue;
        const stack = [];
        let quoted = false;
        let escaped = false;
        for (let end = start; end < source.length; end++) {
            const char = source[end];
            if (quoted) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === '"') quoted = false;
                continue;
            }
            if (char === '"') quoted = true;
            else if (char === '[' || char === '{') stack.push(char);
            else if (char === ']' || char === '}') {
                const opener = stack.pop();
                if ((char === ']' && opener !== '[') || (char === '}' && opener !== '{')) break;
                if (!stack.length) {
                    try { return JSON.parse(source.slice(start, end + 1)); } catch { break; }
                }
            }
        }
    }
    return null;
}

function normalizeRole(value) {
    const role = String(value ?? '').trim().toLowerCase().replace(/[\s_-]/g, '');
    if (['旁白', 'narrator', 'narration'].includes(role)) return '旁白';
    if (['主角', '男主', '男主角', 'protagonist', 'hero'].includes(role)) return '主角';
    if (['女主', '女主角', '女主一', 'heroine', 'femalelead', 'femalelead1'].includes(role)) return '女主一';
    if (['女主二', 'femalelead2', 'heroine2'].includes(role)) return '女主二';
    if (['女主三', 'femalelead3', 'heroine3'].includes(role)) return '女主三';
    if (['女主四', '女主五', '女主六', '女主七', '女主八', '女主九', '女主十', 'femalelead4', 'heroine4'].includes(role)) return '女主四';
    if (['男npc一', '男性npc一', 'malenpc1'].includes(role)) return '男NPC一';
    if (['男npc二', '男性npc二', 'malenpc2', '男npc三', '男npc四', '男npc五', '男npc六', '男npc七', '男npc八', '男npc九', '男性npc三', '男性npc四', 'malenpc3', 'malenpc4', 'malenpc5'].includes(role)) return '男NPC二';
    if (['女npc一', '女性npc一', 'femalenpc1'].includes(role)) return '女NPC一';
    if (['女npc二', '女性npc二', 'femalenpc2', '女npc三', '女npc四', '女npc五', '女npc六', '女npc七', '女npc八', '女npc九', '女性npc三', '女性npc四', 'femalenpc3', 'femalenpc4', 'femalenpc5'].includes(role)) return '女NPC二';
    if (['npc一', 'npc1', '男npc', '男性npc', 'malenpc'].includes(role)) return '男NPC一';
    if (['npc二', 'npc2'].includes(role)) return '男NPC二';
    if (['女npc', '女性npc', 'femalenpc'].includes(role)) return '女NPC二';
    if (role === '未知角色' || role === 'unknown' || role === 'unknownspeaker') return '未知角色';
    return '未知角色';
}

function normalizeEmotion(value) {
    if (value === null || value === undefined || value === '') return null;
    const emotion = String(value).trim().toLowerCase();
    if (EMOTIONS.has(emotion)) return emotion;
    return EMOTION_NAMES[String(value).trim()] || null;
}

function normalizeRows(raw) {
    const parsed = parseJsonValue(raw);
    const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? [parsed] : null);
    if (!rows?.length || rows.length > 1000) return null;

    const normalized = [];
    for (const source of rows) {
        if (typeof source !== 'string' && (!source || typeof source !== 'object')) continue;
        const row = typeof source === 'string' ? { text_content: source } : source;
        const role = normalizeRole(row.role_name ?? row.role ?? row.speaker ?? row.speaker_name ?? row.name ?? row.roleName);
        const rawSegments = row.minimax_segments ?? row.segments ?? row.parts ?? row.items;
        let parts = Array.isArray(rawSegments) ? rawSegments : [];
        if (typeof rawSegments === 'string') {
            const parsedParts = parseJsonValue(rawSegments);
            parts = Array.isArray(parsedParts) ? parsedParts : [{ type: 'text', text: rawSegments }];
        }

        const segments = [];
        for (const sourcePart of parts) {
            const part = typeof sourcePart === 'string' ? { type: 'text', text: sourcePart } : sourcePart;
            if (!part || typeof part !== 'object') continue;
            const type = String(part.type ?? part.kind ?? '').trim().toLowerCase();
            const text = part.text ?? part.content ?? part.value;
            if (type === 'text' || (!type && text !== undefined)) {
                const content = String(text ?? '');
                if (content) segments.push({ type: 'text', text: content, emotion: role === '旁白' ? null : normalizeEmotion(part.emotion ?? part.emotion_name ?? part.emotionName) });
            } else if ((type === 'sound' || type === 'audio') && role !== '旁白') {
                const tag = String(part.tag ?? part.sound ?? part.value ?? '').trim();
                if (SOUND_TAGS.has(tag)) segments.push({ type: 'sound', tag });
            } else if ((type === 'pause' || type === 'break') && role !== '旁白') {
                const seconds = Number(part.seconds ?? part.duration ?? part.value);
                if (Number.isFinite(seconds) && seconds >= 0.01 && seconds <= 99.99) segments.push({ type: 'pause', seconds });
            }
        }

        const derivedText = segments.filter(part => part.type === 'text').map(part => part.text).join('');
        const declaredText = row.text_content ?? row.text ?? row.content ?? row.utterance ?? '';
        if (derivedText && declaredText && derivedText !== String(declaredText)) return null;
        const textContent = derivedText || String(declaredText);
        if (!textContent) continue;
        if (!segments.some(part => part.type === 'text')) {
            segments.unshift({ type: 'text', text: textContent, emotion: null });
        }
        normalized.push({
            role_name: role,
            text_content: segments.filter(part => part.type === 'text').map(part => part.text).join(''),
            emotion_name: String(row.emotion_name ?? row.emotion ?? row.emotionName ?? ''),
            strength_name: '',
            minimax_segments: segments
        });
    }
    if (!normalized.length) return null;
    return normalized;
}

function stripBoldMarkers(value) {
    return String(value).replace(/(?<!\*)\*\*(?!\*)(\S(?:[^*\n]*?\S)?)\*\*(?!\*)/g, '$1');
}

function stripHtmlControlBlocks(value) {
    const proseTags = new Set([
        'p', 'span', 'br', 'em', 'strong', 'b', 'i', 'u', 's', 'del', 'ins', 'small', 'mark',
        'sub', 'sup', 'blockquote', 'q', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'ruby', 'rt', 'rp'
    ]);
    const voidTags = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
        'param', 'source', 'track', 'wbr'
    ]);
    const controlTags = new Set([
        'html', 'head', 'body', 'script', 'style', 'template', 'noscript', 'svg', 'canvas',
        'iframe', 'form', 'button', 'select', 'textarea', 'table', 'nav', 'div', 'section',
        'aside', 'header', 'footer', 'main', 'details', 'dialog', 'menu', 'figure', 'picture',
        'audio', 'video', 'pre', 'code', 'analysis', 'jsonpatch', 'updatevariable', 'update',
        'state', 'status', 'statusplaceholderimpl', 'variable', 'variables', 'thinking', 'think',
        'tool', 'tool_call', 'frontend', 'display', 'panel', 'hud'
    ]);
    const source = String(value ?? '').replace(/\\(?=<\/?(?:UpdateVariable|Analysis|StatusPlaceHolderImpl)\b)/gi, '');
    const marker = /\\*<\s*(\/?)\s*([A-Za-z][A-Za-z0-9:_-]*)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/g;
    const stack = [];
    let output = '';
    let cursor = 0;
    let match;

    while ((match = marker.exec(source))) {
        const tag = match[2].toLowerCase();
        // Unknown wrapper tags (for example <stella>) are prose: remove the tag, keep its text.
        if (!controlTags.has(tag)) continue;
        if (!stack.length) output += source.slice(cursor, match.index);
        if (match[1]) {
            const matchingIndex = stack.lastIndexOf(tag);
            if (matchingIndex >= 0) stack.length = matchingIndex;
        } else if (!voidTags.has(tag) && !/\/\s*>$/.test(match[0])) {
            stack.push(tag);
        }
        cursor = marker.lastIndex;
    }
    if (!stack.length) output += source.slice(cursor);
    return output;
}

function stripBracketControlBlocks(value) {
    const knownTags = new Set([
        'INSIDE', 'UI', 'STATUS', 'STATE', 'UPDATE', 'VARIABLE', 'VARIABLES', 'THINK',
        'THINKING', 'TOOL', 'TOOL_CALL', 'TEMPLATE', 'FRONTEND', 'DISPLAY', 'PANEL', 'HUD',
        'HTML', 'SCRIPT', 'STYLE', 'SYSTEM'
    ]);
    const marker = /\[\[\s*(\/?)\s*([A-Za-z][A-Za-z0-9_-]{1,31})(?:\s+[^\]]*)?\s*\]\]/g;
    const source = String(value ?? '');
    const stack = [];
    let output = '';
    let cursor = 0;
    let match;

    while ((match = marker.exec(source))) {
        const rawTag = match[2];
        const tag = rawTag.toUpperCase();
        if (!knownTags.has(tag) && rawTag !== tag) continue;
        if (!stack.length) output += source.slice(cursor, match.index);
        if (match[1]) {
            const matchingIndex = stack.lastIndexOf(tag);
            if (matchingIndex >= 0) stack.length = matchingIndex;
        } else {
            stack.push(tag);
        }
        cursor = marker.lastIndex;
    }
    if (!stack.length) output += source.slice(cursor);
    return output.replace(/\[\[\s*\/?[A-Za-z][A-Za-z0-9_-]{1,31}[^\]]*\]\]/g, '');
}

function stripNonSpeechBlocks(value) {
    return stripBracketControlBlocks(stripHtmlControlBlocks(
        String(value ?? '')
            .replace(/<!--[^]*?-->/g, '')
            .replace(/<%[^]*?%>/g, '')
            .replace(/\x60{3}[^]*?(?:\x60{3}|$)/g, '')
            .replace(/~~~[^]*?(?:~~~|$)/g, '')
    ));
}

function rowsMatchReadable(rows, readable) {
    const comparable = value => stripBoldMarkers(value).replace(/["“”「」『』‘’]/g, '').trim();
    const visibleProse = stripNonSpeechBlocks(readable)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    return comparable(rows.map(row => row.text_content).join('')) === comparable(visibleProse);
}

export function extractReading(value) {
    const source = String(value ?? '');
    const blocks = extractRawBlocks(source);
    const clean = stripReadingBlocks(source).trimEnd();

    // Several blocks in one reply: take the last block that parses into valid rows.
    let rows = null;
    for (const block of blocks) {
        const parsed = normalizeRows(block.raw);
        if (parsed) {
            rows = parsed;
            break;
        }
    }

    // The structure block is the playback source of truth. A wrapped or repeated
    // visible body must not invalidate it; the rows are already checked internally.
    const matchesVisibleProse = rows ? rowsMatchReadable(rows, clean) : false;
    return {
        rows,
        clean,
        readable: clean,
        hasStructureBlock: blocks.length > 0,
        matchesVisibleProse
    };
}

export function sanitizeReadableText(value) {
    return stripNonSpeechBlocks(stripReadingBlocks(value))
        .replace(/<br\s*\/?>/gi, '\n')
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
        while (text[end] === '(') {
            const close = text.indexOf(')', end + 1);
            if (close < 0 || !SOUND_TAGS.has(text.slice(end + 1, close))) break;
            end = close + 1;
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
    const legacyDialogue = settings.dialogueVoice || voices.femaleNpc2 || voices.femaleNpc1;
    if (role === '旁白') return voices.narrator || settings.narratorVoice || legacyDialogue;
    if (role === '主角') return voices.protagonist || legacyDialogue;
    if (role === '女主一') {
        const selected = Object.prototype.hasOwnProperty.call(voices, 'heroine1') ? voices.heroine1 : voices.heroine;
        return selected || legacyDialogue;
    }
    if (role === '女主二') return voices.heroine2 || voices.heroine1 || legacyDialogue;
    if (role === '女主三') return voices.heroine3 || voices.heroine2 || voices.heroine1 || legacyDialogue;
    if (role === '女主四') return voices.heroine4 || voices.heroine3 || voices.heroine2 || voices.heroine1 || legacyDialogue;
    if (role === '男NPC一') return voices.maleNpc1 || voices.maleNpc || voices.npc1 || legacyDialogue;
    if (role === '男NPC二') return voices.maleNpc2 || voices.maleNpc1 || voices.maleNpc || voices.npc2 || legacyDialogue;
    if (role === '女NPC一') return voices.femaleNpc1 || voices.femaleNpc || legacyDialogue;
    if (role === '女NPC二') return voices.femaleNpc2 || voices.femaleNpc1 || voices.femaleNpc || legacyDialogue;
    return legacyDialogue;
}

function textChunksForRow(row, joinSoundWithPrevious = false) {
    if (!Array.isArray(row.minimax_segments)) {
        const text = String(row.text_content ?? '');
        return text.trim() ? [{ type: 'text', text, emotion: null }] : [];
    }
    const chunks = [];
    let current = null;
    let pendingSound = '';
    for (const part of row.minimax_segments) {
        if (part.type === 'pause') {
            current = null;
            if (pendingSound) {
                chunks.push({ type: 'text', text: pendingSound, emotion: null });
                pendingSound = '';
            }
            chunks.push({ type: 'pause', seconds: part.seconds });
        } else if (part.type === 'sound') {
            // A sound row directly after narration is performed at the start of
            // that narration segment, not in a separate request that would add a gap.
            if (current) current.text += '(' + part.tag + ')';
            else if (joinSoundWithPrevious && chunks.length && chunks[chunks.length - 1].type === 'text') {
                chunks[chunks.length - 1].text += '(' + part.tag + ')';
                current = chunks[chunks.length - 1];
            } else pendingSound += '(' + part.tag + ')';
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
    return chunks;
}

export function buildAudioSegments(reading, settings) {
    const text = sanitizeReadableText(reading?.readable ?? reading?.clean ?? '');
    let rows = reading?.rows;
    if (!Array.isArray(rows) || !rows.length) rows = fallbackRows(text);

    const segments = [];
    rows.forEach((row, rowIndex) => {
        const kind = roleKind(row.role_name);
        if (settings.playbackMode === 'narrator' && kind !== 'narrator') return;
        if (settings.playbackMode === 'dialogue' && kind !== 'dialogue') return;
        const voice = getRoleVoice(row.role_name, settings) ||
            settings.voices?.femaleNpc2 || settings.voices?.narrator || settings.dialogueVoice;
        const speed = kind === 'narrator' ? settings.speed : settings.dialogueSpeed;
        for (const chunk of textChunksForRow(row, rowIndex > 0)) {
            if (chunk.type === 'pause') {
                segments.push({ type: 'pause', seconds: chunk.seconds, kind, role: row.role_name, sourceRow: rowIndex });
                continue;
            }
            if (!chunk.text.trim()) continue;
            const segment = {
                type: 'audio',
                text: chunk.text,
                kind,
                role: row.role_name,
                voice,
                speed,
                emotion: chunk.emotion || null,
                sourceRow: rowIndex,
                forceBreak: false
            };
            const previous = segments[segments.length - 1];
            const canJoin = previous?.type === 'audio' &&
                previous.sourceRow === rowIndex - 1 &&
                previous.role === segment.role &&
                previous.kind === segment.kind &&
                previous.voice === segment.voice &&
                previous.speed === segment.speed &&
                previous.emotion === segment.emotion &&
                !previous.forceBreak &&
                !segment.forceBreak;
            if (canJoin) {
                previous.text += segment.text;
                previous.sourceRow = rowIndex;
            } else {
                segments.push(segment);
            }
        }
    });
    return segments;
}

export function makeAudioRequestBody(settings, segment) {
    const voice = segment.voice || settings.voices?.femaleNpc2 || settings.voices?.narrator || settings.dialogueVoice;
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

function segmentDurationWeight(segment, settings) {
    if (segment?.type === 'pause') return Math.max(0, Number(segment.seconds) || 0);
    const characters = Math.max(1, Array.from(String(segment?.text ?? '').replace(/\s/g, '')).length);
    const speed = Number(segment?.speed ?? (segment?.kind === 'dialogue' ? settings.dialogueSpeed : settings.speed)) || 1;
    return characters / Math.max(0.1, speed);
}

export function buildTimeline(segments, measuredDurations = [], settings = {}) {
    let knownDuration = 0;
    let knownWeight = 0;
    for (let index = 0; index < segments.length; index++) {
        if (segments[index]?.type === 'pause') continue;
        const duration = Number(measuredDurations[index]);
        if (Number.isFinite(duration) && duration > 0) {
            knownDuration += duration;
            knownWeight += segmentDurationWeight(segments[index], settings);
        }
    }
    const secondsPerWeight = knownWeight > 0 ? knownDuration / knownWeight : 0.22;
    const durations = segments.map((segment, index) => {
        if (segment?.type === 'pause') return Math.max(0, Number(segment.seconds) || 0);
        const measured = Number(measuredDurations[index]);
        return Number.isFinite(measured) && measured > 0
            ? measured
            : Math.max(0.6, segmentDurationWeight(segment, settings) * secondsPerWeight);
    });
    return {
        durations,
        total: durations.reduce((sum, duration) => sum + duration, 0),
        complete: segments.length > 0 && segments.every((segment, index) =>
            segment?.type === 'pause' || (Number.isFinite(Number(measuredDurations[index])) && Number(measuredDurations[index]) > 0))
    };
}

export function timelinePosition(timeline, index, elapsedSeconds) {
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(0, timeline.durations.length - 1)));
    const before = timeline.durations.slice(0, safeIndex).reduce((sum, duration) => sum + duration, 0);
    const duration = timeline.durations[safeIndex] || 0;
    const current = Math.min(timeline.total, before + Math.max(0, Math.min(Number(elapsedSeconds) || 0, duration)));
    return { ...timeline, current, progress: timeline.total > 0 ? current / timeline.total * 100 : 0 };
}

export function timelineTarget(timeline, percent) {
    const current = Math.max(0, Math.min(timeline.total, timeline.total * (Number(percent) / 100)));
    let before = 0;
    for (let index = 0; index < timeline.durations.length; index++) {
        const duration = timeline.durations[index];
        if (current < before + duration || index === timeline.durations.length - 1) {
            return {
                ...timeline,
                current,
                index,
                offset: Math.max(0, Math.min(duration, current - before))
            };
        }
        before += duration;
    }
    return { ...timeline, current: 0, index: 0, offset: 0 };
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
    const startIndex = Math.max(0, Math.min(items.length, Math.floor(Number(options.startIndex) || 0)));
    let next = startIndex;
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
    for (let index = startIndex; index < items.length; index++) {
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
