import { MarkdownRenderer, MarkdownPostProcessorContext, MarkdownRenderChild } from 'obsidian';
import { splitMgoCardSections, extractCardBody, parseCardDisplay, revealCloze } from '../data/cardText';
import { toHardBreaks } from '../data/constants';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

/**
 * 阅读视图后处理器。
 * Obsidian 会把未知自定义标签（<mgo-card> 等）净化掉，内容被合并成一段，
 * 无法靠 CSS 恢复结构。这里用 getSectionInfo 取回原始 markdown 源文本，
 * 自己重建渲染：普通文本正常渲染，卡片渲染成带正面/背面分块样式的 .mgo-card。
 */
export function makeCardPostProcessor(plugin: FSRSFlashcardsPlugin) {
    return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        const info = ctx.getSectionInfo(el);
        if (!info || !info.text.includes('<mgo-card')) return;

        const { text, lineStart, lineEnd } = info;
        const source = text.split('\n').slice(lineStart, lineEnd + 1).join('\n');
        const sections = splitMgoCardSections(source);
        if (!sections.some(s => s.type === 'card')) return;

        el.empty();
        const render = new MarkdownRenderChild(el);
        ctx.addChild(render);

        for (const section of sections) {
            if (section.type === 'text') {
                const p = el.createDiv({ cls: 'mgo-plain' });
                void MarkdownRenderer.render(plugin.app, section.value, p, ctx.sourcePath, render);
                continue;
            }
            const body = extractCardBody(section.value);
            const { front, back } = parseCardDisplay(body);
            const cardEl = el.createDiv({ cls: 'mgo-card-render' });

            const isCloze = /==c\d+::/.test(body);
            if (isCloze) {
                const c = cardEl.createDiv({ cls: 'mgo-cloze' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(revealCloze(body.trim())), c, ctx.sourcePath, render);
            } else if (front || back) {
                const f = cardEl.createDiv({ cls: 'mgo-front' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(front), f, ctx.sourcePath, render);
                if (back) {
                    const b = cardEl.createDiv({ cls: 'mgo-back' });
                    void MarkdownRenderer.render(plugin.app, toHardBreaks(back), b, ctx.sourcePath, render);
                }
            }
        }
    };
}
