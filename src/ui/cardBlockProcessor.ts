import { MarkdownRenderer, MarkdownRenderChild, Notice, setIcon, type Plugin } from 'obsidian';
import { toHardBreaks } from '../data/constants';
import { CARD_FENCE_LANGS, answerMatches, hasCloze, parseCardBlockAttributes, parseCardBlockBody, parseMultiInputItems, resolveQuizAnswer, resolveQuizKind, revealCloze } from '../data/cardText';
import { editCardAtSource } from './editCardSource';
import { resolveAudioSrc } from './audioSrc';

const BLANK_RE = /（\s*）|\(\s*\)|＿{2,}|_{2,}/;
const BLANK_RE_ALL = /（\s*）|\(\s*\)|＿{2,}|_{2,}/g;

/**
 * 把题干里的空位依次换成打字框；题干是按 Markdown 渲染过的，所以走文本节点替换。
 * 空位不够时把剩下的输入框追加到行尾，多出来的空位保持原样，至少不丢题。
 */
function insertBlanks(host: HTMLElement, inputs: HTMLElement[]): void {
    const doc = host.ownerDocument;
    const pending = inputs.slice();
    const walker = doc.createTreeWalker(host, 4 /* NodeFilter.SHOW_TEXT */);
    const texts: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);

    for (const original of texts) {
        if (pending.length === 0) break;
        let current: Text | null = original;
        while (current && pending.length > 0) {
            const text = current.nodeValue ?? '';
            const m = text.match(BLANK_RE);
            if (!m || m.index === undefined) break;
            const after = doc.createTextNode(text.slice(m.index + m[0].length));
            current.parentNode?.insertBefore(after, current.nextSibling);
            current.parentNode?.insertBefore(pending[0], after);
            current.nodeValue = text.slice(0, m.index);
            pending.shift();
            current = after;
        }
    }
    for (const rest of pending) host.appendChild(rest);
}

/** 输入框默认一个全角字宽，随输入内容变宽。 */
function fitMultiInputWidth(input: HTMLInputElement): void {
    const len = [...input.value].length;
    input.setCssProps({ width: `${Math.max(1, len)}em` });
}

/** 一句里有多个空时，答案按空格/顿号拆成对应份数；对不上就整串当一个答案。 */
function splitAnswerParts(answer: string, count: number): string[] {
    if (count <= 1) return [answer];
    const parts = answer.split(/[\s、,，／|｜]+/).filter(Boolean);
    return parts.length === count ? parts : [answer];
}

// keyCode 229 用于识别输入法确认候选词，不能只看 isComposing。
const isComposingKey = (evt: KeyboardEvent): boolean => {
    const legacyKeyCode = (evt as unknown as { keyCode?: number }).keyCode;
    return evt.isComposing || legacyKeyCode === 229;
};

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

            const audioUrl = resolveAudioSrc(plugin.app, typeof attrs.audio === 'string' ? attrs.audio : '');
            if (audioUrl) attachAudioButton(el, audioUrl);

            if (hasCloze(body)) {
                const c = el.createDiv({ cls: 'mgo-cloze' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(revealCloze(body)), c, ctx.sourcePath, child);
                return;
            }

            const { front, back } = parseCardBlockBody(body);
            if (!front) return;
            const options = Array.isArray(attrs.options) ? attrs.options : [];
            const answer = typeof attrs.answer === 'string' ? attrs.answer.trim() : undefined;
            const kind = resolveQuizKind(typeof attrs.type === 'string' ? attrs.type : undefined, options, answer);
            const correctIndex = resolveQuizAnswer(answer, options);
            const reveal = typeof attrs.reveal === 'string' && /^(1|true|yes|on)$/i.test(attrs.reveal.trim());

            const detailTarget = typeof attrs.detail === 'string' ? attrs.detail.trim() : '';
            const detailFile = detailTarget
                ? plugin.app.metadataCache?.getFirstLinkpathDest?.(detailTarget, ctx.sourcePath) ?? null
                : null;
            const renderBack = (host: HTMLElement) => {
                const answerEl = host.createDiv({ cls: 'mgo-quiz-answer' });
                answerEl.hide();
                if (back) {
                    void MarkdownRenderer.render(plugin.app, toHardBreaks(back), answerEl, ctx.sourcePath, child);
                }
                return answerEl;
            };

            const renderActions = (host: HTMLElement) => {
                const actions = host.createDiv({ cls: 'mgo-quiz-actions' });
                const revealBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal', text: '显示答案' });
                const detailBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal mgo-quiz-detail-toggle', text: '详解' });
                detailBtn.hide();
                const resetBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal mgo-quiz-reset', text: '重做' });
                resetBtn.hide();
                return { revealBtn, detailBtn, resetBtn };
            };

            if (kind === 'multi') {
                const answersRaw = Array.isArray(attrs.answers)
                    ? attrs.answers
                    : typeof attrs.answers === 'string'
                        ? attrs.answers.split(/[、,，／|｜]/)
                        : [];
                const items = parseMultiInputItems(front, answersRaw);
                if (items.length === 0) return;

                const card = el.createDiv({ cls: 'mgo-quiz-card mgo-multi-card' });
                if (options.length > 0) {
                    const bank = card.createDiv({
                        cls: 'mgo-quiz-multi-bank',
                        attr: { role: 'list', 'aria-label': '共用词库' },
                    });
                    options.forEach((option, index) => {
                        const item = bank.createSpan({
                            cls: 'mgo-quiz-multi-bank-item',
                            attr: { role: 'listitem' },
                        });
                        item.createSpan({ cls: 'mgo-quiz-multi-bank-key', text: String.fromCharCode(65 + index) });
                        item.createSpan({ cls: 'mgo-quiz-multi-bank-text', text: option });
                    });
                }
                const list = card.createDiv({ cls: 'mgo-quiz-multi-list' });
                const rows = items.map((item) => {
                    const row = list.createDiv({ cls: 'mgo-quiz-multi-row' });
                    row.createSpan({ cls: 'mgo-quiz-multi-no', text: item.no });
                    const textEl = row.createSpan({ cls: 'mgo-quiz-multi-text' });
                    const blankCount = (item.text.match(BLANK_RE_ALL) ?? []).length;
                    const parts = splitAnswerParts(item.answer, blankCount);
                    const inputs = parts.map((_part, index) => {
                        const input = row.createEl('input', {
                            cls: 'mgo-quiz-input mgo-quiz-multi-input',
                            attr: {
                                type: 'text',
                                autocomplete: 'off',
                                spellcheck: 'false',
                                'aria-label': parts.length > 1 ? `第 ${item.no} 题第 ${index + 1} 空` : `第 ${item.no} 题答案`,
                            },
                        });
                        input.setCssProps({ width: '1em' });
                        input.addEventListener('input', () => fitMultiInputWidth(input));
                        return input;
                    });
                    void MarkdownRenderer.render(plugin.app, item.text, textEl, ctx.sourcePath, child)
                        .then(() => insertBlanks(textEl, inputs));
                    const hint = row.createSpan({ cls: 'mgo-quiz-multi-answer' });
                    hint.hide();
                    return { row, inputs, parts, hint, item };
                });

                const feedback = card.createDiv({ cls: 'mgo-quiz-feedback' });
                feedback.hide();
                const actions = card.createDiv({ cls: 'mgo-quiz-actions' });
                const checkBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal', text: '检查' });
                const revealBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal', text: '显示答案' });
                const detailBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal mgo-quiz-detail-toggle', text: '详解' });
                detailBtn.hide();
                const resetBtn = actions.createEl('button', { cls: 'mgo-quiz-reveal mgo-quiz-reset', text: '重做' });
                resetBtn.hide();
                const answerEl = renderBack(card);
                let answered = false;

                const finish = (revealMode: boolean) => {
                    if (answered) return;
                    answered = true;
                    let correct = 0;
                    for (const r of rows) {
                        r.inputs.forEach((input) => { input.disabled = true; });
                        if (revealMode) {
                            r.inputs.forEach((input, index) => {
                                input.value = r.parts[index] ?? '';
                                fitMultiInputWidth(input);
                            });
                            r.row.addClass('is-revealed');
                        } else if (r.parts.length > 0 && r.parts.every((part, index) => r.inputs[index] && answerMatches(r.inputs[index].value, part))) {
                            correct++;
                            r.row.addClass('is-correct');
                        } else {
                            r.row.addClass('is-wrong');
                            r.hint.setText(r.item.answer ? `正解：${r.item.answer}` : '没给答案');
                            r.hint.show();
                        }
                    }
                    feedback.removeClass('is-correct', 'is-wrong', 'is-skipped');
                    if (revealMode) {
                        feedback.setText('已显示答案');
                        feedback.addClass('is-skipped');
                    } else {
                        feedback.setText(`答对 ${correct} / ${rows.length}`);
                        feedback.addClass(correct === rows.length ? 'is-correct' : 'is-wrong');
                    }
                    feedback.show();
                    answerEl.show();
                    checkBtn.hide();
                    revealBtn.hide();
                    if (detailFile) detailBtn.show();
                    resetBtn.show();
                };

                checkBtn.addEventListener('click', () => finish(false));
                revealBtn.addEventListener('click', () => finish(true));
                rows.forEach((r, index) => {
                    r.inputs.forEach((input) => {
                        input.addEventListener('keydown', (evt: KeyboardEvent) => {
                            if (evt.key !== 'Enter' || isComposingKey(evt)) return;
                            evt.preventDefault();
                            if (answered) return;
                            const next = rows[index + 1];
                            if (next) next.inputs[0]?.focus();
                            else finish(false);
                        });
                    });
                });
                detailBtn.addEventListener('click', () => {
                    if (!detailFile || !detailTarget) return;
                    void plugin.app.workspace.openLinkText(detailTarget, ctx.sourcePath, true);
                });
                resetBtn.addEventListener('click', () => {
                    answered = false;
                    for (const r of rows) {
                        r.inputs.forEach((input) => {
                            input.disabled = false;
                            input.value = '';
                            fitMultiInputWidth(input);
                        });
                        r.row.removeClass('is-correct', 'is-wrong', 'is-revealed');
                        r.hint.hide();
                        r.hint.empty();
                    }
                    feedback.hide();
                    feedback.empty();
                    feedback.removeClass('is-correct', 'is-wrong', 'is-skipped');
                    answerEl.hide();
                    detailBtn.hide();
                    checkBtn.show();
                    revealBtn.show();
                    resetBtn.hide();
                    rows[0]?.inputs[0]?.focus();
                });
                return;
            }

            if (kind === 'choice' && correctIndex !== null) {
                const quiz = el.createDiv({ cls: 'mgo-quiz-card' });
                const stem = quiz.createDiv({ cls: 'mgo-quiz-stem' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(front), stem, ctx.sourcePath, child);

                const list = quiz.createDiv({ cls: 'mgo-quiz-options' });
                const rows: HTMLElement[] = [];
                options.forEach((option, index) => {
                    const row = list.createDiv({ cls: 'mgo-quiz-option', attr: { role: 'button', tabindex: '0' } });
                    row.createSpan({ cls: 'mgo-quiz-key', text: String(index + 1) });
                    row.createSpan({ cls: 'mgo-quiz-text', text: option });
                    rows.push(row);
                });

                const feedback = quiz.createDiv({ cls: 'mgo-quiz-feedback' });
                feedback.hide();
                const { revealBtn, detailBtn, resetBtn } = renderActions(quiz);
                const answerEl = renderBack(quiz);
                let answered = false;

                const grade = (picked: number | null) => {
                    if (answered) return;
                    answered = true;
                    rows.forEach((row, index) => {
                        row.addClass('is-locked');
                        row.setAttribute('aria-disabled', 'true');
                        if (index === correctIndex) row.addClass('is-correct');
                        if (picked !== null && index === picked && index !== correctIndex) row.addClass('is-wrong');
                    });
                    feedback.removeClass('is-correct', 'is-wrong', 'is-skipped');
                    if (picked === null) {
                        feedback.setText('已显示答案');
                        feedback.addClass('is-skipped');
                    } else if (picked === correctIndex) {
                        feedback.setText('回答正确');
                        feedback.addClass('is-correct');
                    } else {
                        feedback.setText(`回答错误，正确答案：${correctIndex + 1}`);
                        feedback.addClass('is-wrong');
                    }
                    feedback.show();
                    answerEl.show();
                    revealBtn.hide();
                    if (detailFile) detailBtn.show();
                    resetBtn.show();
                };

                rows.forEach((row, index) => {
                    row.addEventListener('click', () => grade(index));
                    row.addEventListener('keydown', (evt: KeyboardEvent) => {
                        if (evt.key !== 'Enter' && evt.key !== ' ') return;
                        evt.preventDefault();
                        grade(index);
                    });
                });
                revealBtn.addEventListener('click', () => grade(null));
                detailBtn.addEventListener('click', () => {
                    if (!detailFile || !detailTarget) return;
                    void plugin.app.workspace.openLinkText(detailTarget, ctx.sourcePath, true);
                });
                resetBtn.addEventListener('click', () => {
                    answered = false;
                    rows.forEach((row) => {
                        row.removeClass('is-locked', 'is-correct', 'is-wrong');
                        row.removeAttribute('aria-disabled');
                    });
                    feedback.hide();
                    feedback.empty();
                    feedback.removeClass('is-correct', 'is-wrong', 'is-skipped');
                    answerEl.hide();
                    detailBtn.hide();
                    revealBtn.show();
                    resetBtn.hide();
                });
                return;
            }

            if (kind === 'input' && answer) {
                const card = el.createDiv({ cls: 'mgo-quiz-card mgo-reveal-card' });
                const stem = card.createDiv({ cls: 'mgo-quiz-stem' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(front), stem, ctx.sourcePath, child);

                const inputRow = card.createDiv({ cls: 'mgo-quiz-input-row' });
                const input = inputRow.createEl('input', {
                    cls: 'mgo-quiz-input',
                    attr: { type: 'text', placeholder: '输入答案…', autocomplete: 'off', spellcheck: 'false' },
                });
                const checkBtn = inputRow.createEl('button', { cls: 'mgo-quiz-reveal', text: '检查' });

                const feedback = card.createDiv({ cls: 'mgo-quiz-feedback' });
                feedback.hide();
                const { revealBtn, detailBtn, resetBtn } = renderActions(card);
                const answerEl = renderBack(card);
                const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, '');
                let answered = false;

                const finish = (ok: boolean | null) => {
                    if (answered) return;
                    answered = true;
                    input.disabled = true;
                    checkBtn.disabled = true;
                    feedback.removeClass('is-correct', 'is-wrong', 'is-skipped');
                    if (ok === null) {
                        feedback.setText('已显示答案');
                        feedback.addClass('is-skipped');
                    } else if (ok) {
                        feedback.setText('回答正确');
                        feedback.addClass('is-correct');
                    } else {
                        feedback.setText(`回答错误，正确答案：${answer}`);
                        feedback.addClass('is-wrong');
                    }
                    feedback.show();
                    answerEl.show();
                    revealBtn.hide();
                    if (detailFile) detailBtn.show();
                    resetBtn.show();
                };

                const check = () => {
                    if (answered) return;
                    const typed = normalize(input.value);
                    if (!typed) return;
                    finish(typed === normalize(answer));
                };
                checkBtn.addEventListener('click', check);
                input.addEventListener('keydown', (evt: KeyboardEvent) => {
                    if (evt.key !== 'Enter' || isComposingKey(evt)) return;
                    evt.preventDefault();
                    check();
                });
                revealBtn.addEventListener('click', () => finish(null));
                detailBtn.addEventListener('click', () => {
                    if (!detailFile || !detailTarget) return;
                    void plugin.app.workspace.openLinkText(detailTarget, ctx.sourcePath, true);
                });
                resetBtn.addEventListener('click', () => {
                    answered = false;
                    input.disabled = false;
                    input.value = '';
                    checkBtn.disabled = false;
                    feedback.hide();
                    feedback.empty();
                    feedback.removeClass('is-correct', 'is-wrong', 'is-skipped');
                    answerEl.hide();
                    detailBtn.hide();
                    revealBtn.show();
                    resetBtn.hide();
                    input.focus();
                });
                return;
            }

            if (reveal && back) {
                const card = el.createDiv({ cls: 'mgo-quiz-card mgo-reveal-card' });
                const stem = card.createDiv({ cls: 'mgo-quiz-stem' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(front), stem, ctx.sourcePath, child);
                const { revealBtn } = renderActions(card);
                const answerEl = renderBack(card);
                let shown = false;
                revealBtn.addEventListener('click', () => {
                    shown = !shown;
                    if (shown) answerEl.show(); else answerEl.hide();
                    revealBtn.setText(shown ? '收起答案' : '显示答案');
                });
                return;
            }

            const f = el.createDiv({ cls: 'mgo-front' });
            void MarkdownRenderer.render(plugin.app, toHardBreaks(front), f, ctx.sourcePath, child);
            if (back) {
                const b = el.createDiv({ cls: 'mgo-back' });
                void MarkdownRenderer.render(plugin.app, toHardBreaks(back), b, ctx.sourcePath, child);
            }
        });
    }
}