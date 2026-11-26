import { MarkdownRenderer, MarkdownRenderChild, Notice, setIcon, type Plugin } from 'obsidian';
import { toHardBreaks } from '../data/constants';
import { CARD_FENCE_LANGS, hasCloze, parseCardBlockAttributes, parseCardBlockBody, revealCloze } from '../data/cardText';
import { editCardAtSource } from './editCardSource';

let currentAudio: HTMLAudioElement | null = null;

function stopCurrentAudio(): void {
    if (!currentAudio) return;
    try { currentAudio.pause(); } catch { /* 元素可能已被卸载 */ }
    currentAudio = null;
}

/**
 * 卡片右下角的小喇叭：播放 `audio:` 属性里的语音。
 * 反复点是「播放 / 停止」，开始播另一张卡时先停掉上一张。
 */
function attachAudioButton(el: HTMLElement, url: string): void {
    el.addClass('mgo-card-has-audio');
    const btn = el.createDiv({
        cls: 'mgo-card-audio',
        attr: { role: 'button', tabindex: '0', 'aria-label': '播放语音' },
    });
    setIcon(btn, 'volume-2');

    let player: HTMLAudioElement | null = null;
    const reset = () => {
        player = null;
        btn.removeClass('is-playing');
        btn.setAttribute('aria-label', '播放语音');
        setIcon(btn, 'volume-2');
    };

    const toggle = (ev?: Event) => {
        ev?.preventDefault();
        ev?.stopPropagation();
        if (player) {
            stopCurrentAudio();
            reset();
            return;
        }
        stopCurrentAudio();
        const win = btn.ownerDocument.defaultView ?? window;
        const audio = new win.Audio(url);
        player = audio;
        currentAudio = audio;
        btn.addClass('is-playing');
        btn.setAttribute('aria-label', '停止播放');
        setIcon(btn, 'pause');
        audio.addEventListener('ended', () => { if (player === audio) reset(); });
        audio.addEventListener('error', () => {
            if (player !== audio) return;
            reset();
            new Notice('音频加载失败');
        });
        void audio.play().catch(() => {
            if (player !== audio) return;
            reset();
            new Notice('无法播放这段音频');
        });
    };

    btn.addEventListener('click', toggle);
    btn.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' || ev.key === ' ') toggle(ev);
    });
}

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
            const { attrs, content } = parseCardBlockAttributes(raw);
            const body = content.trim();
            if (!body) return;

            const audioUrl = typeof attrs.audio === 'string' ? attrs.audio.trim() : '';
            if (audioUrl) attachAudioButton(el, audioUrl);

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