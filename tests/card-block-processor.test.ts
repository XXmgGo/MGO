// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('obsidian', () => {
    class Notice { constructor(_message: string) {} }
    class TFile {
        path: string;
        constructor(path = 'x.md') { this.path = path; }
    }
    class MarkdownView {
        file: TFile | null = null;
        editor: unknown = null;
        getMode() { return 'source'; }
    }
    return {
        Notice, TFile, MarkdownView,
        MarkdownRenderer: {
            render: async (_app: unknown, text: string, el: HTMLElement) => { el.textContent = text; },
        },
        MarkdownRenderChild: class {
            constructor(public el: HTMLElement) {}
        },
    };
});

import { MarkdownView, TFile } from 'obsidian';
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
    proto.removeClass = function (this: HTMLElement, c: string) { this.classList.remove(c); };
    proto.empty = function (this: HTMLElement) { this.replaceChildren(); };
    proto.find = function (this: HTMLElement, s: string) { return this.querySelector(s); };
    proto.hide = function (this: HTMLElement) { this.style.display = 'none'; };
    proto.show = function (this: HTMLElement) { this.style.display = ''; };
    proto.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
    proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
        for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
    };
});

function createProcessor(app: unknown = {}) {
    const handlers: Record<string, (source: string, el: HTMLElement, ctx: unknown) => void> = {};
    registerCardCodeBlocks({
        app,
        registerMarkdownCodeBlockProcessor: (lang: string, fn: never) => { handlers[lang] = fn; },
    } as never);
    return handlers;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('card code block processor', () => {
    it('renders a plain card with an MGO badge and strips attributes', async () => {
        const handler = createProcessor()['mgo'];
        const el = document.createElement('div');
        handler('---\ntitle: 标题\n---\n正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();

        expect(el.classList.contains('mgo-card-render')).toBe(true);
        expect(el.querySelector('.mgo-front')!.textContent).toBe('正面');
        expect(el.querySelector('.mgo-back')!.textContent).toBe('背面');
        expect(el.querySelector('.mgo-front')!.textContent).not.toContain('title');
        const flair = el.querySelector('.mgo-card-flair') as HTMLElement;
        expect(flair.textContent).toBe('MGO');
        expect(flair.getAttribute('aria-label')).toBe('编辑卡片源代码');
    });

    it('opens the fence for editing when the MGO badge is clicked', async () => {
        const noteText = '# 标题\n\n```mgo\n正面\n---\n背面\n```\n';
        const editor = {
            getValue: () => noteText,
            offsetToPos: (offset: number) => ({ line: 3, ch: offset }),
            setCursor: vi.fn(),
            scrollIntoView: vi.fn(),
            focus: vi.fn(),
        };
        const mdView = Object.create(MarkdownView.prototype) as { file: unknown; editor: unknown };
        mdView.file = new TFile('x.md');
        mdView.editor = editor;
        const leaf = { view: mdView, setViewState: vi.fn(async () => undefined) };
        const app = {
            workspace: {
                getLeavesOfType: () => [leaf],
                setActiveLeaf: vi.fn(),
                getLeaf: () => leaf,
            },
            vault: { getAbstractFileByPath: () => new TFile('x.md') },
        };

        const handler = createProcessor(app)['mgo'];
        const el = document.createElement('div');
        handler('正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();

        (el.querySelector('.mgo-card-flair') as HTMLElement).click();
        await flush();

        expect(editor.setCursor).toHaveBeenCalled();
        expect(editor.focus).toHaveBeenCalled();
        expect(app.workspace.setActiveLeaf).toHaveBeenCalled();
    });

    it('renders cloze cards', async () => {
        const handler = createProcessor()['mgo'];
        const el = document.createElement('div');
        handler('The ==c1::sky== is blue.', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();
        expect(el.querySelector('.mgo-cloze')!.textContent).toBe('The ==sky== is blue.');
    });
});