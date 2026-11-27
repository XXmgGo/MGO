/**
 * 卡片语法工具（不依赖 Obsidian API，可单测）。
 *
 * 语法：```mgo / ```mgo-reverse / ```mgo-typein 代码围栏，
 * 块内独立一行 --- 分隔正/背面。
 */

/** 代码围栏卡片语言名。 */
export const CARD_FENCE_LANGS = ['mgo', 'mgo-reverse', 'mgo-typein'] as const;
export type CardFenceLang = (typeof CARD_FENCE_LANGS)[number];
export const CARD_BLOCK_RE = /```(mgo-reverse|mgo-typein|mgo)[ \t]*\r?\n([\s\S]*?)```/gi;

/** 块内是否有挖空标记。 */
export function hasCloze(body: string): boolean {
    return /==c\d+::/.test(body);
}

/** 挖空编号（去重，按出现顺序）。 */
export function clozeNumbers(body: string): string[] {
    return [...new Set([...body.matchAll(/==c(\d+)::/g)].map(m => m[1]))];
}

/** 挖空卡正面：目标编号显示 [提示] 或 [...]，其它编号显示答案。 */
export function clozeFront(body: string, clozeNum: string): string {
    return body.replace(/==c(\d+)::(.*?)==/gs, (_m, num: string, ansBody: string): string => {
        const colonIdx = ansBody.indexOf('::');
        const answer = colonIdx !== -1 ? ansBody.slice(0, colonIdx) : ansBody;
        const hint = colonIdx !== -1 ? ansBody.slice(colonIdx + 2) : '';
        return num === clozeNum ? (hint ? `[${hint}]` : '[...]') : answer;
    }).trim();
}

/** 挖空卡背面：全部编号显示答案。 */
export function clozeBack(body: string): string {
    return body.replace(/==c\d+::(.*?)==/gs, (_m, ansBody: string): string => {
        const colonIdx = ansBody.indexOf('::');
        return colonIdx !== -1 ? ansBody.slice(0, colonIdx) : ansBody;
    }).trim();
}

/** 解析代码围栏卡片体：首条内容为 `---` 的行分隔正/背面；没有分隔时整块算正面。 */
export function parseCardBlockBody(body: string): { front: string; back: string } {
    const lines = body.trim().split(/\r?\n/);
    const idx = lines.findIndex(l => l.trim() === '---');
    if (idx === -1) return { front: lines.join('\n').trim(), back: '' };
    return {
        front: lines.slice(0, idx).join('\n').trim(),
        back: lines.slice(idx + 1).join('\n').trim(),
    };
}

/**
 * 卡片属性（写在块顶部的一对 `---` 之间）：
 *
 * ```mgo
 * ---
 * title: 单词卡
 * id: fsrs-abc123
 * options: [食べる, 飲む, 走る]
 * hint: 注意动词分类
 * ---
 * 正面
 * ---
 * 背面
 * ```
 *
 * 键名未知时原样保留（前向兼容）。id 只允许字母、数字、下划线和连字符。
 */
export interface CardAttributes {
    title?: string;
    id?: string;
    /** 卡片类型：single-choice / input / multi-input / basic；不写时按 options + answer 推断。 */
    type?: string;
    options?: string[];
    /** 选择题正确答案：1 起始序号、A–J 字母，或选项原文。 */
    answer?: string;
    hint?: string;
    /** 详解笔记名（通常是以正确句子命名的笔记）：题卡作答后可打开。 */
    detail?: string;
    /** 语音地址：卡片右下角显示小喇叭，点击播放。 */
    audio?: string;
    /** 写 `false` 时只按卡片框显示，不登记成闪卡。 */
    flashcard?: string;
    [key: string]: string | string[] | undefined;
}

export type QuizKind = 'choice' | 'input' | 'multi';

const QUIZ_TYPE_ALIASES: Record<string, QuizKind | 'basic'> = {
    'single-choice': 'choice',
    quiz: 'choice',
    mc: 'choice',
    input: 'input',
    blank: 'input',
    fill: 'input',
    typein: 'input',
    'multi-input': 'multi',
    multiinput: 'multi',
    multi: 'multi',
    basic: 'basic',
    card: 'basic',
};

/**
 * 卡片类型：显式 `type:` 优先，没写时按数据推断。
 * - `single-choice` 需要 options + 可解析的 answer
 * - `input` 需要 answer
 * - `multi-input` 多句共用词库的填空题：正面每行一句、`answers:` 逐行给答案
 * - `basic` 明确当普通卡；无法满足声明的类型时退回普通卡（null）。
 */
export function resolveQuizKind(
    type: string | undefined,
    options: readonly string[] | undefined,
    answer: string | undefined,
): QuizKind | null {
    const declared = type ? QUIZ_TYPE_ALIASES[type.normalize('NFKC').trim().toLowerCase()] : undefined;
    if (declared === 'basic') return null;
    if (declared === 'multi') return 'multi';
    if (declared === 'choice') {
        return resolveQuizAnswer(answer, options) === null ? null : 'choice';
    }
    if (declared === 'input') {
        return answer && answer.trim() ? 'input' : null;
    }
    if (resolveQuizAnswer(answer, options) !== null) return 'choice';
    if (answer && answer.trim()) return 'input';
    return null;
}

/**
 * 解析选择题的正确答案，返回 0 起始的选项下标。
 * 支持 `answer: 2`、`answer: B`、`answer: 増える`；无选项或无法匹配时返回 null。
 */
export function resolveQuizAnswer(answer: string | undefined, options: readonly string[] | undefined): number | null {
    if (!answer || !options || options.length < 2) return null;
    const value = answer.normalize('NFKC').trim();
    if (!value) return null;
    if (/^\d+$/.test(value)) {
        const index = Number(value) - 1;
        return index >= 0 && index < options.length ? index : null;
    }
    if (/^[A-Za-z]$/.test(value)) {
        const index = value.toUpperCase().charCodeAt(0) - 65;
        return index >= 0 && index < options.length ? index : null;
    }
    const exact = options.findIndex(option => option.trim() === value);
    if (exact !== -1) return exact;
    const normalized = options.findIndex(option => option.normalize('NFKC').trim() === value);
    return normalized !== -1 ? normalized : null;
}

/** 多句填空题（multi-input）里的一句：题号、题干、答案。 */
export interface MultiInputItem {
    no: string;
    text: string;
    answer: string;
}

const MULTI_NO_RE = /^(\d{1,3})\s*[.．、:：|｜]?\s+(.+)$/;

/**
 * 拆出多句填空题的每一行：行首是题号（`11 子どもを…`）时单独取出来，
 * 没写题号就按出现顺序编号；答案按顺序从 `answers:` 里取。
 */
export function parseMultiInputItems(front: string, answers: readonly string[]): MultiInputItem[] {
    return front
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const m = line.match(MULTI_NO_RE);
            return {
                no: m ? m[1] : String(index + 1),
                text: m ? m[2].trim() : line,
                answer: (answers[index] ?? '').trim(),
            };
        });
}

function normalizeTypedAnswer(value: string): string {
    return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

/**
 * 打字答案是否命中：全半角、空格不敏感；
 * `answers:` 里带字母标号（`C 上で`）时，只写词（`上で`）也算对。
 */
export function answerMatches(typed: string, expected: string): boolean {
    const value = normalizeTypedAnswer(typed);
    if (!value) return false;
    if (value === normalizeTypedAnswer(expected)) return true;
    const withoutLabel = expected.replace(/^[A-Za-z]\s*[.．、:：]?\s+/, '');
    return withoutLabel !== expected && value === normalizeTypedAnswer(withoutLabel);
}

function unquote(value: string): string {
    const v = value.trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
        return v.slice(1, -1);
    }
    return v;
}

function splitCsv(value: string): string[] {
    return value.split(',').map(v => unquote(v)).filter(Boolean);
}

/** 仅当头部每一行都是 `键: 值` 或 `- 列表项` 时才认属性段，其它情况按正文处理。 */
function parseAttributeLines(lines: string[]): CardAttributes | null {
    const attrs: CardAttributes = {};
    let listKey: string | null = null;
    let listValues: string[] = [];
    const flush = () => {
        if (listKey) attrs[listKey] = listValues;
        listKey = null;
        listValues = [];
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        const item = line.match(/^-\s+(.+)$/);
        if (item) {
            if (!listKey) return null;
            listValues.push(unquote(item[1]));
            continue;
        }
        const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
        if (!m) return null;
        flush();
        const key = m[1];
        const value = m[2].trim();
        if (!value) {
            listKey = key;
        } else if (value.startsWith('[') && value.endsWith(']')) {
            attrs[key] = splitCsv(value.slice(1, -1));
        } else {
            attrs[key] = unquote(value);
        }
    }
    flush();

    if (typeof attrs.options === 'string') attrs.options = splitCsv(attrs.options);
    if (attrs.id !== undefined && (typeof attrs.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(attrs.id))) {
        delete attrs.id;
    }
    for (const key of ['title', 'hint', 'answer']) {
        const v = attrs[key];
        if (Array.isArray(v)) attrs[key] = v.join(', ');
    }
    return attrs;
}

/** 从块体里拆出属性头；没有合法属性头时原样返回。 */
export function parseCardBlockAttributes(body: string): { attrs: CardAttributes; content: string } {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    let start = 0;
    while (start < lines.length && !lines[start].trim()) start++;
    if (start >= lines.length || lines[start].trim() !== '---') return { attrs: {}, content: body };

    let end = -1;
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i].trim() === '---') { end = i; break; }
    }
    if (end < 0) return { attrs: {}, content: body };

    const attrs = parseAttributeLines(lines.slice(start + 1, end));
    if (!attrs || Object.keys(attrs).length === 0) return { attrs: {}, content: body };
    return { attrs, content: lines.slice(end + 1).join('\n') };
}

/** 笔记展示用的挖空还原：==cN::答案::提示== → ==提示或答案==（Obsidian 高亮）。 */
export function revealCloze(text: string): string {
    return text.replace(/==c(\d+)::([^=]+?)==/g, (_m, _n, body: string) => {
        const i = body.indexOf('::');
        const answer = i !== -1 ? body.slice(0, i) : body;
        const hint = i !== -1 ? body.slice(i + 2).trim() : '';
        return `==${hint || answer}==`;
    });
}