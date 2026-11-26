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
        setIcon: (el: HTMLElement, icon: string) => { el.setAttribute('data-icon', icon); },
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

    it('renders a speaker button for the audio attribute', async () => {
        const handler = createProcessor()['mgo'];
        const el = document.createElement('div');
        handler('---\naudio: https://cdn.example.com/a.mp3\n---\n正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();

        expect(el.classList.contains('mgo-card-has-audio')).toBe(true);
        const btn = el.querySelector('.mgo-card-audio') as HTMLElement;
        expect(btn).not.toBeNull();
        expect(btn.getAttribute('aria-label')).toBe('播放语音');
    });

    it('plays the audio when the speaker is clicked', async () => {
        const play = vi.fn().mockResolvedValue(undefined);
        const pause = vi.fn();
        const created: string[] = [];
        class FakeAudio {
            constructor(src: string) { created.push(src); }
            play = play;
            pause = pause;
            addEventListener = vi.fn();
        }
        const original = (window as Window & typeof globalThis).Audio;
        (window as unknown as Record<string, unknown>).Audio = FakeAudio;
        try {
            const handler = createProcessor()['mgo'];
            const el = document.createElement('div');
            handler('---\naudio: https://cdn.example.com/a.mp3\n---\n正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
            await flush();

            const btn = el.querySelector('.mgo-card-audio') as HTMLElement;
            btn.click();
            await flush();

            expect(created).toEqual(['https://cdn.example.com/a.mp3']);
            expect(play).toHaveBeenCalled();
            expect(btn.classList.contains('is-playing')).toBe(true);

            btn.click();
            expect(pause).toHaveBeenCalled();
            expect(btn.classList.contains('is-playing')).toBe(false);
        } finally {
            (window as unknown as Record<string, unknown>).Audio = original;
        }
    });

    it('keeps cards without audio free of the speaker button', async () => {
        const handler = createProcessor()['mgo'];
        const el = document.createElement('div');
        handler('正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();

        expect(el.classList.contains('mgo-card-has-audio')).toBe(false);
        expect(el.querySelector('.mgo-card-audio')).toBeNull();
    });

    it('adds the audio button for a vault: local path', async () => {
        const app = { vault: { adapter: { getResourcePath: (path: string) => `app://vault/${path}` } } };
        const handler = createProcessor(app)['mgo'];
        const el = document.createElement('div');
        handler('---\ntitle: 标题\naudio: vault:_resource/a.mp3\n---\n正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();

        expect(el.classList.contains('mgo-card-has-audio')).toBe(true);
        expect(el.querySelector('.mgo-card-audio')).not.toBeNull();
    });

    it('hides the audio button when a local path cannot be resolved', async () => {
        const handler = createProcessor({})['mgo'];
        const el = document.createElement('div');
        handler('---\ntitle: 标题\naudio: vault:_resource/a.mp3\n---\n正面\n---\n背面', el, { sourcePath: 'x.md', addChild: () => {} });
        await flush();

        expect(el.classList.contains('mgo-card-has-audio')).toBe(false);
        expect(el.querySelector('.mgo-card-audio')).toBeNull();
    });
});