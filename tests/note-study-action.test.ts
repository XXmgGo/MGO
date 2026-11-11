// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

const sessions = vi.hoisted(() => [] as Array<{ cards: unknown[]; title: string }>);
const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
    Notice: class { constructor(message: string) { notices.push(message); } },
    MarkdownView: class {
        containerEl = document.createElement('div');
        file: { path: string; basename: string } | null = null;
        mode = 'source';
        save = vi.fn().mockResolvedValue(undefined);
        getMode() { return this.mode; }
        addAction(icon: string, title: string, click: () => void) {
            const action = document.createElement('button');
            action.dataset.icon = icon;
            action.setAttribute('aria-label', title);
            action.addEventListener('click', click);
            this.containerEl.append(action);
            return action;
        }
    },
}));
vi.mock('../src/ui/ReviewModal', () => ({
    ReviewModal: class {
        constructor(_app: unknown, _plugin: unknown, cards: unknown[], title: string) { sessions.push({ cards, title }); }
        open() {}
    },
}));

import { MarkdownView } from 'obsidian';
import { updateNoteStudyActions } from '../src/ui/noteStudyAction';

beforeAll(() => {
    Object.assign(HTMLElement.prototype, {
        addClass(this: HTMLElement, cls: string) { this.classList.add(cls); },
        hide(this: HTMLElement) { this.style.display = 'none'; },
        show(this: HTMLElement) { this.style.display = ''; },
    });
});

function setup() {
    const first = new MarkdownView({} as never);
    const second = new MarkdownView({} as never);
    const note = (path: string) => ({ path, basename: path.replace('.md', '') });
    first.file = note('First.md') as never;
    second.file = note('Second.md') as never;
    const cleanups: Array<() => void> = [];
    const plugin = {
        app: { workspace: { getLeavesOfType: () => [{ view: first }, { view: second }] } },
        dataManager: {
            isDataLoaded: () => true,
            isFileDeck: (file: { path: string }) => file.path !== 'Plain.md',
            updateFile: vi.fn().mockResolvedValue(true),
            recalculateAllDeckStats: vi.fn(),
            getDeckId: (path: string) => path,
            getReviewQueue: (id: string) => [{ id }],
            getCardsByDeck: () => [{}],
            getDecks: () => [{ id: 'First.md', title: 'First deck' }, { id: 'Second.md', title: 'Second deck' }],
        },
        refreshDashboardView: vi.fn(),
        register: (fn: () => void) => cleanups.push(fn),
        registerDomEvent: (el: HTMLElement, event: string, callback: EventListener) => {
            el.addEventListener(event, callback);
            cleanups.push(() => el.removeEventListener(event, callback));
        },
    };
    const refresh = () => updateNoteStudyActions(plugin as never);
    refresh();
    return { plugin, first, second, refresh, cleanups, note };
}

const action = (view: MarkdownView) => view.containerEl.querySelector<HTMLButtonElement>('.fsrs-note-study-action')!;

describe('note study toolbar action', () => {
    it('adds one native action per flashcard pane and studies the note belonging to that pane', async () => {
        const { first, second, refresh, plugin } = setup();
        refresh();
        expect(first.containerEl.querySelectorAll('.fsrs-note-study-action')).toHaveLength(1);
        action(second).click();
        await vi.waitFor(() => expect(sessions.at(-1)?.title).toBe('Second deck'));
        expect(sessions.at(-1)?.cards).toEqual([{ id: 'Second.md' }]);
        expect(plugin.dataManager.updateFile).toHaveBeenCalledWith(second.file);
    });

    it('follows file changes, hides on ordinary notes and removes actions on unload', async () => {
        const { first, refresh, note, cleanups } = setup();
        const original = action(first);
        first.file = note('Plain.md') as never;
        refresh();
        expect(original.style.display).toBe('none');
        first.file = note('Second.md') as never;
        refresh();
        expect(action(first)).toBe(original);
        expect(original.style.display).toBe('');
        original.click();
        await vi.waitFor(() => expect(sessions.at(-1)?.title).toBe('Second deck'));
        cleanups.forEach(fn => fn());
        expect(first.containerEl.querySelector('.fsrs-note-study-action')).toBeNull();
    });

    it('supports keyboard activation in reading mode without saving the note', async () => {
        const { first } = setup();
        (first as unknown as { mode: string }).mode = 'preview';
        const count = sessions.length;
        action(first).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await vi.waitFor(() => expect(sessions.length).toBe(count + 1));
        expect(first.save).not.toHaveBeenCalled();
    });

    it('explains daily limits and does not open an empty session', async () => {
        const { first, plugin } = setup();
        plugin.dataManager.getReviewQueue = () => [];
        const count = sessions.length;
        action(first).click();
        await vi.waitFor(() => expect(notices.at(-1)).toContain('daily limits'));
        expect(sessions).toHaveLength(count);
    });

    it('waits for edits to save, prevents duplicate sessions and cancels when the pane changes notes', async () => {
        const { first, note } = setup();
        let finish: () => void = () => {};
        vi.mocked(first.save).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
        const count = sessions.length;
        action(first).click();
        action(first).click();
        expect(first.save).toHaveBeenCalledTimes(1);
        first.file = note('Second.md') as never;
        finish();
        await Promise.resolve();
        await Promise.resolve();
        expect(sessions).toHaveLength(count);
    });
});
