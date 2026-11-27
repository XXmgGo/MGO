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

describe('note quiz rendering', () => {
    it('grades a click and can reset', async () => {
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

    it('opens the detail note when the card declares detail', async () => {
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

    it('keeps flashcard:false cards interactive in the note', async () => {
        const source = ['---', 'type: single-choice', 'options: [A, B]', 'answer: B', 'flashcard: false', '---', '问题', '---', '正解：B'].join('\n');
        const el = await render(source);
        expect(el.querySelectorAll('.mgo-quiz-option')).toHaveLength(2);
        (el.querySelectorAll('.mgo-quiz-option')[1] as HTMLElement).click();
        expect(el.querySelector('.mgo-quiz-feedback')!.textContent).toContain('回答正确');
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

    it('renders the shared A–J word bank inside a multi-input card', async () => {
        const options = ['すべき', 'ばかりに', 'はもちろん', 'まい', 'ば～ほど', 'ほど', 'はともかく', 'よりほかはない', '反面', 'は別として'];
        const source = [
            '---',
            'type: multi-input',
            `options: [${options.join(', ')}]`,
            'answers: [ば～ほど, 反面]',
            '---',
            '11 間違いが少なければ少ない（　）いい。',
            '12 彼は人前で明るく振舞う（　）、家に帰ると無口になる。',
            '---',
            '正解：11 E ば～ほど / 12 I 反面',
        ].join('\n');

        const el = await render(source);
        const card = el.querySelector('.mgo-multi-card')!;
        const bank = card.querySelector('.mgo-quiz-multi-bank')!;
        expect(bank).not.toBeNull();
        expect(bank.nextElementSibling?.classList.contains('mgo-quiz-multi-list')).toBe(true);
        expect(Array.from(bank.querySelectorAll('.mgo-quiz-multi-bank-key')).map((node) => node.textContent))
            .toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
        expect(Array.from(bank.querySelectorAll('.mgo-quiz-multi-bank-text')).map((node) => node.textContent))
            .toEqual(options);
        expect(el.textContent).not.toContain('options:');
    });

    it('checks every blank of a multi-input card', async () => {
        const source = [
            '---',
            'type: multi-input',
            'answers:',
            '- C 上で',
            '- B あまり',
            '---',
            '11 子どもを教育する（　）大事なことは叱るだけでなく、ほめることである。',
            '12 息子の病気を心配する（　）、仕事が手につかなくなった。',
            '---',
            '正解：11 C 上で / 12 B あまり',
        ].join('\n');

        const el = await render(source);
        const inputs = Array.from(el.querySelectorAll('.mgo-quiz-multi-input')) as HTMLInputElement[];
        expect(inputs).toHaveLength(2);
        expect(inputs[0].parentElement!.classList.contains('mgo-quiz-multi-text')).toBe(true);
        expect(el.querySelectorAll('.mgo-quiz-multi-no')[1].textContent).toBe('12');

        inputs[0].value = '上で';
        inputs[1].value = 'ちがう';
        const check = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '检查') as HTMLElement;
        check.click();
        expect(el.querySelector('.mgo-quiz-feedback')!.textContent).toContain('答对 1 / 2');
        expect(el.querySelectorAll('.mgo-quiz-multi-row.is-correct')).toHaveLength(1);
        expect(el.querySelectorAll('.mgo-quiz-multi-row.is-wrong')).toHaveLength(1);
        const hint = el.querySelector('.mgo-quiz-multi-row.is-wrong .mgo-quiz-multi-answer') as HTMLElement;
        expect(hint.style.display).not.toBe('none');
        expect(hint.textContent).toBe('正解：B あまり');

        const reset = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '重做') as HTMLElement;
        reset.click();
        expect(inputs[0].disabled).toBe(false);
        expect(inputs[1].value).toBe('');
        expect(el.querySelectorAll('.mgo-quiz-multi-row.is-wrong')).toHaveLength(0);
    });

    it('splits one multi-blank item into two inputs and grades both', async () => {
        const source = [
            '---',
            'type: multi-input',
            'options: [ば～ほど, ほど]',
            'answers:',
            '- ば ほど',
            '- ほど',
            '---',
            '11 間違いが少なけれ（　）少ない（　）いい。',
            '12 少なければ少ない（　）いい。',
            '---',
            '正解：11 ば ほど / 12 ほど',
        ].join('\n');

        const el = await render(source);
        const rows = Array.from(el.querySelectorAll('.mgo-quiz-multi-row'));
        const first = Array.from(rows[0].querySelectorAll('.mgo-quiz-multi-input')) as HTMLInputElement[];
        expect(first).toHaveLength(2);
        expect(first[0].style.width).toBe('1em');
        expect(rows[1].querySelectorAll('.mgo-quiz-multi-input')).toHaveLength(1);

        first[0].value = 'ば';
        first[0].dispatchEvent(new Event('input'));
        expect(first[0].style.width).toBe('1em');
        first[0].value = 'ければ';
        first[0].dispatchEvent(new Event('input'));
        expect(first[0].style.width).toBe('3em');
        first[0].value = 'ば';
        first[1].value = 'ほど';
        const second = rows[1].querySelector('.mgo-quiz-multi-input') as HTMLInputElement;
        second.value = 'ほど';

        const check = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '检查') as HTMLElement;
        check.click();
        expect(el.querySelector('.mgo-quiz-feedback')!.textContent).toContain('答对 2 / 2');
    });

    it('fills every blank when a multi-input answer is revealed', async () => {
        const source = [
            '---',
            'type: multi-input',
            'answers: [上で, あまり]',
            '---',
            '11 子どもを教育する（　）こと。',
            '12 心配する（　）こと。',
            '---',
            '正解：11 上で / 12 あまり',
        ].join('\n');
        const el = await render(source);
        const reveal = Array.from(el.querySelectorAll('button')).find((b) => b.textContent === '显示答案') as HTMLElement;
        reveal.click();
        const inputs = Array.from(el.querySelectorAll('.mgo-quiz-multi-input')) as HTMLInputElement[];
        expect(inputs.map((i) => i.value)).toEqual(['上で', 'あまり']);
        expect(inputs[0].disabled).toBe(true);
        expect(el.querySelector('.mgo-quiz-feedback')!.textContent).toContain('已显示答案');
    });
});