// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('obsidian', () => {
    class Notice { constructor(_message: string) {} }
    class Component { unload() {} }
    class TFile {
        path: string;
        constructor(path = 'x.md') { this.path = path; }
    }
    class MarkdownView {
        file: TFile | null = null;
        editor: unknown = null;
    }
    class ItemView {
        app: unknown;
        leaf: unknown;
        containerEl: HTMLElement;
        contentEl: HTMLElement;
        constructor(leaf: { app: unknown }) {
            this.leaf = leaf;
            this.app = leaf.app;
            this.containerEl = document.createElement('div');
            this.contentEl = document.createElement('div');
            this.containerEl.appendChild(this.contentEl);
        }
        registerDomEvent(target: EventTarget, type: string, handler: EventListener) {
            target.addEventListener(type, handler);
        }
        registerEvent() {}
    }
    return {
        Notice, Component, TFile, MarkdownView, ItemView,
        MarkdownRenderer: {
            render: async (_app: unknown, text: string, el: HTMLElement) => { el.textContent = text; },
        },
        setIcon: () => {},
    };
});

import { MarkdownView, TFile } from 'obsidian';
import { BrowseView } from '../src/ui/BrowseView';
import { DEFAULT_SETTINGS } from '../src/data/constants';
import type { Card } from '../src/data/types';

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
    proto.empty = function (this: HTMLElement) { this.replaceChildren(); };
    proto.hide = function (this: HTMLElement) { this.style.display = 'none'; };
    proto.show = function (this: HTMLElement) { this.style.display = ''; };
    proto.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
    proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
        for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
    };
});

function makeCard(id: string, filePath = 'a.md'): Card {
    return { id, deckId: 'd', filePath, type: 'basic', originalText: '```mgo\nQ\n---\nA\n```', front: `front ${id}`, back: `back ${id}` };
}

async function openBrowse(cards: Card[], startIndex = 0) {
    const plugin = { settings: { ...DEFAULT_SETTINGS, fontSize: 16 } };
    const leaf: Record<string, unknown> = {
        detach: vi.fn(),
        tabHeaderInnerTitleEl: { setText: vi.fn() },
    };
    const app = {
        workspace: {
            getLeaf: () => leaf,
            getLeavesOfType: () => [] as unknown[],
            setActiveLeaf: vi.fn(),
            on: () => () => undefined,
        },
        vault: { getAbstractFileByPath: () => null },
    };
    leaf.app = app;
    const view = new BrowseView(leaf as never, plugin as never);
    await view.onOpen();
    view.start(cards, 'Deck', startIndex);
    await new Promise((r) => setTimeout(r, 0));
    return { view, leaf, app };
}

const click = async (el: HTMLElement) => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
};

describe('BrowseView (tab)', () => {
    it('shows position, front and back, and navigates with the buttons', async () => {
        const { view } = await openBrowse([makeCard('c1'), makeCard('c2'), makeCard('c3')]);
        const counter = () => view.contentEl.querySelector('.fsrs-review-counter')!.textContent;
        const front = () => view.contentEl.querySelector('.fsrs-card-front')!.textContent;
        const prev = () => view.contentEl.querySelector('[aria-label="上一张卡片"]') as HTMLButtonElement;
        const next = () => view.contentEl.querySelector('[aria-label="下一张卡片"]') as HTMLButtonElement;

        expect(view.getViewType()).toBe('mgo-browse-view');
        expect(counter()).toBe('1 / 3');
        expect(front()).toContain('front c1');
        expect(prev().disabled).toBe(true);

        await click(next());
        expect(counter()).toBe('2 / 3');
        expect(front()).toContain('front c2');

        await click(next());
        expect(counter()).toBe('3 / 3');
        expect(next().disabled).toBe(true);

        await click(prev());
        expect(front()).toContain('front c2');
    });

    it('opens at the requested card', async () => {
        const { view } = await openBrowse([makeCard('c1'), makeCard('c2'), makeCard('c3')], 2);
        expect(view.contentEl.querySelector('.fsrs-review-counter')!.textContent).toBe('3 / 3');
    });

    it('opens the source note from the footer button', async () => {
        const { view, app } = await openBrowse([makeCard('c1', 'notes/Deck.md')]);
        const editor = {
            getValue: () => '# 标题\n\n```mgo\nQ\n---\nA\n```\n',
            offsetToPos: (offset: number) => ({ line: offset, ch: 0 }),
            setCursor: vi.fn(),
            scrollIntoView: vi.fn(),
        };
        const mdView = Object.create(MarkdownView.prototype) as { file: unknown; editor: unknown };
        mdView.file = new TFile('notes/Deck.md');
        mdView.editor = editor;
        const targetLeaf = { view: mdView, openFile: vi.fn(async () => undefined) };
        (app.workspace as unknown as Record<string, unknown>).getLeaf = () => targetLeaf;
        (app as unknown as Record<string, unknown>).vault = {
            getAbstractFileByPath: (path: string) => new TFile(path),
        };

        await click(view.contentEl.querySelector('.fsrs-browse-source-btn') as HTMLElement);
        expect(editor.setCursor).toHaveBeenCalled();
        expect(editor.scrollIntoView).toHaveBeenCalled();
    });
});