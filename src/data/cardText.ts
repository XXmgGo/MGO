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
    options?: string[];
    hint?: string;
    /** 语音地址：卡片右下角显示小喇叭，点击播放。 */
    audio?: string;
    [key: string]: string | string[] | undefined;
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
    for (const key of ['title', 'hint']) {
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