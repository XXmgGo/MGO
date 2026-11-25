/**
 * 纯文本工具：把阅读视图被净化掉的 <mgo-card> 源文本切分为卡片/普通文本段，
 * 并提供展示用的解析辅助（不依赖 Obsidian API，可单测）。
 */

export interface CardSegment {
    type: 'card' | 'text';
    value: string;
}

const CARD_RE = /<mgo-card((?:\s[^>]*)?)>([\s\S]*?)<\/mgo-card>/gi;

/** 将一段源文本按 <mgo-card>…</mgo-card> 切分为 card 与 text 片段。 */
export function splitMgoCardSections(source: string): CardSegment[] {
    const out: CardSegment[] = [];
    let last = 0;
    CARD_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CARD_RE.exec(source)) !== null) {
        if (m.index > last) out.push({ type: 'text', value: source.slice(last, m.index) });
        out.push({ type: 'card', value: m[0] });
        last = m.index + m[0].length;
    }
    if (last < source.length) out.push({ type: 'text', value: source.slice(last) });
    return out;
}

/** 从卡片体内提取正/背面展示文本（front/back 子标签，缺 back 时按整块为 front）。 */
export function parseCardDisplay(body: string): { front: string; back: string } {
    const fm = body.match(/<mgo-card-front(?:\s[^>]*)?>([\s\S]*?)<\/mgo-card-front>/i);
    const bm = body.match(/<mgo-card-back(?:\s[^>]*)?>([\s\S]*?)<\/mgo-card-back>/i);
    if (!fm && !bm) return { front: body.trim(), back: '' };
    const front = (fm ? fm[1] || '' : bm ? body.replace(bm[0], '') : '').trim();
    const back = (bm ? bm[1] || '' : '').trim();
    return { front, back };
}

/** 填空展示：==cN::答案::提示== → ==提示或答案==（Obsidian 高亮）。 */
export function revealCloze(text: string): string {
    return text.replace(/==c(\d+)::([^=]+?)==/g, (_m, _n, body: string) => {
        const i = body.indexOf('::');
        const answer = i !== -1 ? body.slice(0, i) : body;
        const hint = i !== -1 ? body.slice(i + 2).trim() : '';
        return `==${hint || answer}==`;
    });
}

/** 提取单个卡片块中的 body（<mgo-card …> 与 </mgo-card> 之间）。 */
export function extractCardBody(rawCard: string): string {
    const m = CARD_RE.exec(rawCard);
    CARD_RE.lastIndex = 0;
    return m ? (m[2] || '') : rawCard;
}
