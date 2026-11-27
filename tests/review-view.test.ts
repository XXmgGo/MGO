// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { State } from 'ts-fsrs';

const notices = vi.hoisted(() => [] as string[]);

vi.mock('obsidian', () => {
    class Notice {
        constructor(message: string) {
            notices.push(message);
        }
    }
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
    class ButtonComponent {
        buttonEl = document.createElement('button');
        constructor(parent: HTMLElement) { parent.appendChild(this.buttonEl); }
        setButtonText(text: string) { this.buttonEl.textContent = text; return this; }
        setCta() { return this; }
        setDisabled() { return this; }
        onClick(handler: () => void) { this.buttonEl.addEventListener('click', handler); return this; }
    }
    return {
        Notice, Component, TFile, MarkdownView, ItemView, ButtonComponent,
        MarkdownRenderer: {
            render: async (_app: unknown, text: string, el: HTMLElement) => { el.textContent = text; },
        },
        setIcon: () => {},
    };
});

vi.mock('../src/database/PouchDBManager', () => ({ PouchDBManager: class {} }));

import { MarkdownView, TFile } from 'obsidian';
import { ReviewView } from '../src/ui/ReviewView';
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
    proto.removeClass = function (this: HTMLElement, c: string) { this.classList.remove(c); };
    proto.empty = function (this: HTMLElement) { this.replaceChildren(); };
    proto.hide = function (this: HTMLElement) { this.style.display = 'none'; };
    proto.show = function (this: HTMLElement) { this.style.display = ''; };
    proto.setText = function (this: HTMLElement, t: string) { this.textContent = t; };
    proto.find = function (this: HTMLElement, s: string) { return this.querySelector(s); };
    proto.setCssProps = function (this: HTMLElement, props: Record<string, string>) {
        for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
    };
});

function makeCard(id: string, filePath: string, withData = false): Card {
    return {
        id, deckId: 'd', filePath, type: 'basic', originalText: '', front: `front ${id}`, back: `back ${id}`,
        fsrsData: withData ? {
            due: new Date('2026-03-01'), stability: 7.5, difficulty: 4.2, elapsed_days: 1,
            scheduled_days: 7, reps: 4, lapses: 1, state: State.Review, learning_steps: 0,
        } : undefined,
    };
}

async function openView(queue: Card[], deckName = 'Deck') {
    const rated: Card[] = [];
    const plugin = {
        settings: { ...DEFAULT_SETTINGS, fontSize: 16 },
        refreshDashboardView: vi.fn(),
        dataManager: {
            getNextReviewIntervals: () => ({ 1: '1d', 2: '2d', 3: '3d', 4: '4d' }),
            updateCard: (card: Card) => { rated.push(card); },
            canUndo: () => rated.length > 0,
            undoLastRating: () => rated.pop() ?? null,
            areSiblings: () => false,
            isLeech: () => false,
            recalculateAllDeckStats: () => {},
        },
    };
    const leaf: Record<string, unknown> = {
        detach: vi.fn(),
        openFile: vi.fn(async () => undefined),
        tabHeaderInnerTitleEl: { setText: vi.fn() },
    };
    const app = {
        workspace: {
            activeLeaf: leaf,
            getLeaf: () => leaf,
            setActiveLeaf: vi.fn(),
            getLeavesOfType: () => [] as unknown[],
            on: () => () => undefined,
        },
        vault: { getAbstractFileByPath: () => null },
    };
    leaf.app = app;
    const view = new ReviewView(leaf as never, plugin as never);
    leaf.view = view;
    await view.onOpen();
    view.start(queue, deckName);
    await new Promise((r) => setTimeout(r, 0));
    return { view, leaf, app, plugin };
}

const click = async (el: HTMLElement) => {
    el.click();
    await new Promise((r) => setTimeout(r, 0));
};

describe('ReviewView (tab)', () => {
    it('exposes the review view type and deck display name', async () => {
        const { view } = await openView([makeCard('c1', 'a.md')]);
        expect(view.getViewType()).toBe('mgo-review-view');
        expect(view.getDisplayText()).toBe('Deck');
    });

    it('shows the answered counter and deck info', async () => {
        notices.length = 0;
        const { view } = await openView([makeCard('c1', 'a.md'), makeCard('c2', 'b.md', true)]);
        const counter = () => view.contentEl.querySelector('.fsrs-review-counter')!.textContent;
        expect(counter()).toBe('0 / 2');

        await click(view.contentEl.querySelector('.fsrs-show-answer-btn') as HTMLElement);
        await click(view.contentEl.querySelector('.fsrs-rating-good') as HTMLElement);
        expect(counter()).toBe('1 / 2');

        (view.contentEl.querySelector('.fsrs-review-deck') as HTMLElement).click();
        expect(notices.at(-1)).toContain('稳定性：7.50');
    });

    it('dims undo until a rating exists, then restores the card', async () => {
        const { view } = await openView([makeCard('c1', 'a.md'), makeCard('c2', 'b.md')]);
        const undo = () => view.contentEl.querySelector('[aria-label="撤销上次评分"]') as HTMLElement;
        const counter = () => view.contentEl.querySelector('.fsrs-review-counter')!.textContent;
        const front = () => view.contentEl.querySelector('.fsrs-card-front')!.textContent;

        expect(undo().classList.contains('fsrs-review-hint-disabled')).toBe(true);
        const first = front();
        await click(view.contentEl.querySelector('.fsrs-show-answer-btn') as HTMLElement);
        await click(view.contentEl.querySelector('.fsrs-rating-good') as HTMLElement);
        expect(undo().classList.contains('fsrs-review-hint-disabled')).toBe(false);
        expect(counter()).toBe('1 / 2');

        await click(undo());
        expect(counter()).toBe('0 / 2');
        expect(front()).toBe(first);
    });

    it('opens the source note and scrolls to the card block', async () => {
        const card = makeCard('c1', 'notes/Deck.md');
        card.originalText = '```mgo\nQ\n---\nA\n```';
        const { view, leaf, app } = await openView([card]);

        const editor = {
            getValue: () => `# 标题\n\n${card.originalText}\n\n后面`,
            offsetToPos: (offset: number) => ({ line: offset, ch: 0 }),
            setCursor: vi.fn(),
            scrollIntoView: vi.fn(),
        };
        const noteText = `# 标题\n\n${card.originalText}\n\n后面`;
        const mdView = Object.create(MarkdownView.prototype) as { file: unknown; editor: unknown };
        mdView.file = new TFile('notes/Deck.md');
        mdView.editor = editor;
        const targetLeaf = { view: mdView, openFile: vi.fn(async () => undefined) };
        (app.workspace as unknown as Record<string, unknown>).getLeaf = () => targetLeaf;
        (app as unknown as Record<string, unknown>).vault = {
            getAbstractFileByPath: (path: string) => new TFile(path),
        };

        await click(view.contentEl.querySelector('[aria-label="打开原文笔记"]') as HTMLElement);
        expect(editor.setCursor).toHaveBeenCalled();
        const cursor = editor.setCursor.mock.calls[0][0] as { line: number; ch: number };
        expect(cursor.line).toBeLessThan(noteText.indexOf(card.originalText));
        expect(editor.scrollIntoView).toHaveBeenCalled();
        expect(leaf.detach).not.toHaveBeenCalled();
    });

    it('finishes by detaching the tab', async () => {
        const { view, leaf } = await openView([makeCard('c1', 'a.md')]);
        await click(view.contentEl.querySelector('[aria-label="结束复习"]') as HTMLElement);
        expect(leaf.detach).toHaveBeenCalled();
    });

    it('refreshes the current card from its note', async () => {
        const card = makeCard('c1', 'notes/Deck.md');
        card.front = '旧正面';
        card.back = '旧背面';
        const { view } = await openView([card]);

        const internal = view as unknown as {
            plugin: { dataManager: Record<string, unknown>; refreshDashboardView: () => void };
            app: { vault: { getAbstractFileByPath: (p: string) => unknown } };
        };
        const refreshed = { ...card, id: 'c1-refreshed', front: '新正面', back: '新背面' };
        internal.plugin.dataManager.getAllCards = () => [refreshed];
        internal.plugin.dataManager.updateFile = vi.fn(async () => true);
        internal.app.vault.getAbstractFileByPath = () => new TFile('notes/Deck.md');

        await click(view.contentEl.querySelector('[aria-label="刷新全部卡片（R）"]') as HTMLElement);

        expect(internal.plugin.dataManager.updateFile).toHaveBeenCalled();
        expect(view.contentEl.querySelector('.fsrs-card-front')!.textContent).toContain('新正面');
    });

    it('refreshes every card of the session, not just the current one', async () => {
        const a = makeCard('c1', 'a.md');
        a.front = 'A 旧';
        const b = makeCard('c2', 'b.md');
        b.front = 'B 旧';
        const { view } = await openView([a, b]);

        const internal = view as unknown as {
            plugin: { dataManager: Record<string, unknown> };
            app: { vault: { getAbstractFileByPath: (p: string) => unknown } };
            queue: Card[];
        };
        const updateFile = vi.fn(async () => true);
        internal.plugin.dataManager.updateFile = updateFile;
        internal.plugin.dataManager.getAllCards = () => [{ ...a, front: 'A 新' }, { ...b, front: 'B 新' }];
        internal.app.vault.getAbstractFileByPath = (p: string) => new TFile(p);

        await click(view.contentEl.querySelector('[aria-label="刷新全部卡片（R）"]') as HTMLElement);

        expect(updateFile).toHaveBeenCalledTimes(2);
        expect(internal.queue.map((c) => c.front)).toEqual(['A 新', 'B 新']);
    });

    it('handles in-place image cards with tap-to-flip', async () => {
        const card: Card = {
            id: 'image-card-1', deckId: 'deck-1', filePath: 'anatomy.md', type: 'basic', originalText: '...',
            front: '![[diagram-q.png]]', back: '![[diagram-a.png]]',
        };
        const { view } = await openView([card]);
        const v = view as unknown as {
            cardContainer: HTMLElement; frontEl: HTMLElement; answerContainer: HTMLElement;
            inplaceIndicatorEl: HTMLElement; showAnswer(): void; toggleInPlaceView(): void;
        };

        expect(v.cardContainer.classList.contains('fsrs-card-inplace')).toBe(true);
        expect(v.frontEl.style.display).not.toBe('none');
        expect(v.answerContainer.style.display).toBe('none');

        v.showAnswer();
        expect(v.frontEl.style.display).toBe('none');
        expect(v.answerContainer.style.display).not.toBe('none');
        expect(v.inplaceIndicatorEl.textContent).toBe('答案（点击可回看问题）');

        v.toggleInPlaceView();
        expect(v.frontEl.style.display).not.toBe('none');
        expect(v.answerContainer.style.display).toBe('none');
        expect(v.inplaceIndicatorEl.textContent).toBe('问题（点击查看答案）');
    });

    it('shows the speaker only for cards that carry an audio link', async () => {
        const withAudio = makeCard('c1', 'a.md');
        withAudio.audio = 'https://cdn.example.com/a.mp3';
        const { view } = await openView([withAudio, makeCard('c2', 'b.md')]);

        const btn = () => view.contentEl.querySelector('.fsrs-card-audio-btn') as HTMLElement;
        const hint = () => view.contentEl.querySelector('[aria-label="播放语音"]') as HTMLElement;
        expect(btn().style.display).not.toBe('none');
        expect(hint().style.display).not.toBe('none');

        await click(view.contentEl.querySelector('.fsrs-show-answer-btn') as HTMLElement);
        await click(view.contentEl.querySelector('.fsrs-rating-good') as HTMLElement);

        expect(btn().style.display).toBe('none');
        expect(hint().style.display).toBe('none');
    });

    it('plays and stops the card audio from the speaker', async () => {
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
            const card = makeCard('c1', 'a.md');
            card.audio = 'https://cdn.example.com/a.mp3';
            const { view } = await openView([card]);
            const btn = view.contentEl.querySelector('.fsrs-card-audio-btn') as HTMLElement;

            await click(btn);
            expect(created).toEqual(['https://cdn.example.com/a.mp3']);
            expect(play).toHaveBeenCalled();
            expect(btn.classList.contains('is-playing')).toBe(true);

            await click(btn);
            expect(pause).toHaveBeenCalled();
            expect(btn.classList.contains('is-playing')).toBe(false);
        } finally {
            (window as unknown as Record<string, unknown>).Audio = original;
        }
    });

    it('uses a typing box for input cards and checks the answer', async () => {
        const card: Card = {
            id: 'input-1', deckId: 'deck-1', filePath: 'quiz.md', type: 'basic', originalText: '...',
            front: 'お金をためたいと言っている一方で、＿＿＿＿。',
            back: '正解：無駄遣いをしている\n句意：一面说要攒钱，一面却在乱花钱。',
            answer: '無駄遣いをしている', kind: 'input',
        };
        const { view } = await openView([card]);
        const input = view.contentEl.querySelector('.fsrs-typein-input') as HTMLInputElement;
        expect(input).toBeTruthy();
        expect((view.contentEl.querySelector('.fsrs-show-answer-btn') as HTMLElement).style.display).toBe('none');

        input.value = '無駄遣いをしている';
        await click(view.contentEl.querySelector('.fsrs-typein-check-btn') as HTMLElement);
        expect(view.contentEl.querySelector('.fsrs-typein-feedback')!.textContent).toContain('回答正确');
        expect((view.contentEl.querySelector('.fsrs-card-answer') as HTMLElement).style.display).not.toBe('none');
    });

    it('renders options as a clickable quiz and grades the answer', async () => {
        const card: Card = {
            id: 'quiz-1', deckId: 'deck-1', filePath: 'quiz.md', type: 'basic', originalText: '...',
            front: '日本へ留学する学生は（　）一方だ。', back: '増える',
            options: ['増え', '増える', '増やす', '増やし'], answer: '2',
        };
        const { view } = await openView([card]);
        const options = Array.from(view.contentEl.querySelectorAll('.fsrs-quiz-option')) as HTMLElement[];
        expect(options).toHaveLength(4);
        expect(view.contentEl.querySelectorAll('.fsrs-quiz-feedback')).toHaveLength(0);

        await click(options[0]);
        expect(options[0].classList.contains('is-wrong')).toBe(true);
        expect(options[1].classList.contains('is-correct')).toBe(true);
        expect(view.contentEl.querySelector('.fsrs-quiz-feedback')!.textContent).toContain('回答错误');
        expect(view.contentEl.querySelector('.fsrs-rating-again')!.classList.contains('fsrs-rating-suggested')).toBe(true);
        expect((view.contentEl.querySelector('.fsrs-card-answer') as HTMLElement).style.display).not.toBe('none');
    });

    it('suggests Good for a correct pick and supports number keys', async () => {
        const card: Card = {
            id: 'quiz-2', deckId: 'deck-1', filePath: 'quiz.md', type: 'basic', originalText: '...',
            front: '問題', back: '増える',
            options: ['増え', '増える', '増やす', '増やし'], answer: 'B',
        };
        const { view } = await openView([card]);
        (view as unknown as { handleKeyPress(evt: KeyboardEvent): void })
            .handleKeyPress(new KeyboardEvent('keydown', { key: '2' }));
        await new Promise((r) => setTimeout(r, 0));

        const options = Array.from(view.contentEl.querySelectorAll('.fsrs-quiz-option')) as HTMLElement[];
        expect(options[1].classList.contains('is-correct')).toBe(true);
        expect(view.contentEl.querySelector('.fsrs-quiz-feedback')!.textContent).toContain('回答正确');
        expect(view.contentEl.querySelector('.fsrs-rating-good')!.classList.contains('fsrs-rating-suggested')).toBe(true);
    });

    it('reveals the correct option when the answer is skipped', async () => {
        const card: Card = {
            id: 'quiz-3', deckId: 'deck-1', filePath: 'quiz.md', type: 'basic', originalText: '...',
            front: '問題', back: '増える',
            options: ['増え', '増える', '増やす', '増やし'], answer: '増える',
        };
        const { view } = await openView([card]);
        await click(view.contentEl.querySelector('.fsrs-show-answer-btn') as HTMLElement);

        const options = Array.from(view.contentEl.querySelectorAll('.fsrs-quiz-option')) as HTMLElement[];
        expect(options[1].classList.contains('is-correct')).toBe(true);
        expect(view.contentEl.querySelector('.fsrs-quiz-feedback')!.textContent).toContain('已显示答案');
        expect(view.contentEl.querySelector('.fsrs-rating-good')!.classList.contains('fsrs-rating-suggested')).toBe(false);
    });

    it('keeps standard cards showing front and answer together', async () => {
        const card: Card = {
            id: 'text-card-1', deckId: 'deck-1', filePath: 'trivia.md', type: 'basic', originalText: '...',
            front: 'What is the speed of light?', back: '299,792,458 m/s',
        };
        const { view } = await openView([card]);
        const v = view as unknown as {
            cardContainer: HTMLElement; frontEl: HTMLElement; answerContainer: HTMLElement;
            inplaceIndicatorEl: HTMLElement; showAnswer(): void;
        };

        expect(v.cardContainer.classList.contains('fsrs-card-inplace')).toBe(false);
        v.showAnswer();
        expect(v.frontEl.style.display).not.toBe('none');
        expect(v.answerContainer.style.display).not.toBe('none');
        expect(v.inplaceIndicatorEl.style.display).toBe('none');
    });
});