// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';

const processors = new Map<string, (source: string, el: HTMLElement, ctx: unknown) => void>();
const openLinkTextSpy = vi.fn();

vi.mock('obsidian', () => {
    class MarkdownRenderChild {
        constructor(public el: HTMLElement) {}
    }
    class Component { unload() {} }
    class TFile {}
    class Notice {}
    class MarkdownView {}
    return {
        MarkdownRenderChild, Component, TFile, Notice, MarkdownView,
        Plugin: class {},
        setIcon: () => {},
        MarkdownRenderer: {
            render: async (_app: unknown, text: string, el: HTMLElement) => { el.textContent = text; },
        },
    };
});

import { registerCardCodeBlocks } from '../src/ui/cardBlockProcessor';
import { CHOICE_CARDS_ENABLED } from '../src/data/constants';

type Opts = { cls?: string; text?: string; attr?: Record<string, string> };

beforeAll(() => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const make = (parent: HTMLElement, tag: string, o?: Opts | string) => {
        const el = document.createElement(tag);
        const opts = typeof o === 'string' ? { cls: o } : o;
        if (opts?.cls) el.className = opts.cls;
        if (opts?.text) el.textContent = opts.text;
        for (const [k, v] of Object.entries(opts?.attr ?? {})) el.setAttribute(k, v);
        parent.appendChild(el);
        return el;
    };
    proto.createEl = function (this: HTMLElement, tag: string, o?: Opts) { return make(this, tag, o); };
    proto.createDiv = function (this: HTMLElement, o?: Opts) { return make(this, 'div', o); };
    proto.createSpan = function (this: HTMLElement, o?: Opts) { return make(this, 'span', o); };
    proto.addClass = function (this: HTMLElement, c: string) { this.classList.add(c); };
    proto.removeClass = function (this: HTMLElement, ...cs: string[]) { this.classList.remove(...cs); };
    proto.empty = function (this: HTMLElement) { this.replaceChildren(); };
    proto.hide = function (this: HTMLElement) { this.style.display = 'none'; };
    proto.show = function (this: HTMLElement) { this.style.display = ''; };
    proto.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
    proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
        for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
    };

    const appMock = {
        metadataCache: { getFirstLinkpathDest: (link: string) => (link === '详解句' ? { path: '详解句.md' } : null) },
        workspace: { openLinkText: openLinkTextSpy },
    };
    const plugin = {
        app: appMock,
        registerMarkdownCodeBlockProcessor: (lang: string, cb: unknown) => {
            processors.set(lang, cb as never);
        },
    };
    registerCardCodeBlocks(plugin as never);
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function render(source: string): Promise<HTMLElement> {
    const el = document.createElement('div');
    processors.get('mgo')!(source, el, { sourcePath: 'note.md', addChild: () => undefined });
    await tick();
    return el;
}

const quiz = [
    '---',
    'type: single-choice',
    'options: [増え, 増える, 増やす, 増やし]',
    'answer: 2',
    '---',
    'ここ数年、学生は（　）一方だ。',
    '---',
    '正解：増える',
].join('\n');

// 选择题卡片开关关着时，这两条用例不适用（恢复开关后自动跑）。
const itChoice = CHOICE_CARDS_ENABLED ? it : it.skip;

describe('note quiz rendering', () => {
    itChoice('grades a click and can reset', async () => {
        const el = await render(quiz);
        const options = Array.from(el.querySelectorAll('.mgo-quiz-option')) as HTMLElement[];
        expect(options).toHaveLength(4);
        expect((el.querySelector('.mgo-quiz-answer') as HTMLElement).style.display).toBe('none');

        options[0].click();
        expect(options[0].classList.contains('is-wrong')).toBe(true);
        expect(options[1].classList.contains('is-correct')).toBe(true);
        expect(el.querySelector('.mgo-quiz-feedback')!.textContent).toContain('回答错误');
        expect((el.querySelector('.mgo-quiz-answer') as HTMLElement).style.display).not.toBe('none');

        const reset = Array.from(el.querySelectorAll('.mgo-quiz-reveal')).find((b) => b.textContent === '重做') as HTMLElement;
        reset.click();
        expect(options[0].classList.contains('is-wrong')).toBe(false);
        expect((el.querySelector('.mgo-quiz-answer') as HTMLElement).style.display).toBe('none');
    });

    itChoice('opens the detail note when the card declares detail', async () => {
        const source = [
            '---',
            'type: single-choice',
            'options: [増え, 増える]',
            'answer: 2',
            'detail: 详解句',
            '---',
            '学生は（　）一方だ。',
            '---',
            '正解：増える',
            '句意：学生一直在增加。',
        ].join('\n');
        openLinkTextSpy.mockClear();
        const el = await render(source);
        (el.querySelectorAll('.mgo-quiz-option')[1] as HTMLElement).click();
        const btn = Array.from(el.querySelectorAll('.mgo-quiz-reveal')).find((b) => b.textContent === '详解') as HTMLElement;
        expect(btn.style.display).not.toBe('none');
        btn.click();
        expect(openLinkTextSpy).toHaveBeenCalledWith('详解句', 'note.md', true);
    });

    it('checks a typed fill-in answer', async () => {
        const el = await render([
            '---',
            'answer: 無駄遣いをしている',
            'type: input',
            '---',
            'お金をためたいと言っている一方で、＿＿＿＿。',
            '---',
            '正解：無駄遣いをしている',
        ].join('\n'));

        const input = el.querySelector('.mgo-quiz-input') as HTMLInputElement;
        const check = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '检查') as HTMLElement;
        input.value = '無駄遣いをしている';
        check.click();
        expect(el.querySelector('.mgo-quiz-feedback')!.textContent).toContain('回答正确');
        expect(input.disabled).toBe(true);

        const reveal = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '重做') as HTMLElement;
        reveal.click();
        expect(input.disabled).toBe(false);
        expect(input.value).toBe('');
    });
});