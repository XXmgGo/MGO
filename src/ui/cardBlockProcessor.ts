import { MarkdownRenderer, MarkdownRenderChild, type Plugin } from 'obsidian';
import { toHardBreaks } from '../data/constants';
import { CARD_FENCE_LANGS, hasCloze, parseCardBlockAttributes, parseCardBlockBody, revealCloze } from '../data/cardText';
import { editCardAtSource } from './editCardSource';

/**
 * 代码围栏卡片渲染器。
 *
 * 语法定为 ```mgo（反向卡 ```mgo-reverse、输入作答 ```mgo-typein），
 * 块内用独立一行 `---` 分隔正面（问题）与背面（答案），正/背面都支持多行。
 * 走 Obsidian 原生代码块处理器，阅读视图和实时预览都能稳定渲染，不碰编辑器装饰。
 */
export function registerCardCodeBlocks(plugin: Plugin): void {
    for (const lang of CARD_FENCE_LANGS) {
        plugin.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
            const child = new MarkdownRenderChild(el);
            ctx.addChild(child);
            el.empty();
            el.addClass('mgo-card-render');

            // 右上角 MGO 标记：点击进入源码编辑（把光标放进代码块）
            const flair = el.createDiv({
                cls: 'mgo-card-flair',
                text: 'MGO',
                attr: { role: 'button', tabindex: '0', 'aria-label': '编辑卡片源代码' },
            });
            const editSource = (ev?: Event) => {
                ev?.preventDefault();
                ev?.stopPropagation();
                void editCardAtSource(plugin.app, ctx.sourcePath, lang, source);
            };
            flair.addEventListener('click', editSource);
            flair.addEventListener('keydown', (ev: KeyboardEvent) => {
                if (ev.key === 'Enter' || ev.key === ' ') editSource(ev);
            });

            const raw = source.trim();
            if (!raw) return;

            // 属性段只作元数据（由 DataManager 读取），笔记里不渲染，只把它从正文中剥离。
            const { content } = parseCardBlockAttributes(raw);
            const body = content.trim();
            if (!body) return;

            if (hasCloze(body)) {
                const c = el.createDiv({ cls: 'mgo-cloze' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(revealCloze(body)), c, ctx.sourcePath, child);
                return;
            }

            const { front, back } = parseCardBlockBody(body);
            if (!front) return;
            const f = el.createDiv({ cls: 'mgo-front' });
            void MarkdownRenderer.render(plugin.app, toHardBreaks(front), f, ctx.sourcePath, child);
            if (back) {
                const b = el.createDiv({ cls: 'mgo-back' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(back), b, ctx.sourcePath, child);
            }
        });
    }
}