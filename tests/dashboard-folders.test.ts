// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    ItemView: class {
        contentEl = document.createElement('div');
        app = { workspace: { openLinkText: vi.fn().mockResolvedValue(undefined) } };
    },
    Notice: class { hide() {} },
    ButtonComponent: class {
        buttonEl: HTMLButtonElement;
        constructor(parent: HTMLElement) { this.buttonEl = document.createElement('button'); parent.append(this.buttonEl); }
        setButtonText(text: string) { this.buttonEl.textContent = text; return this; }
        setIcon() { return this; }
        setCta() { return this; }
        setDisabled(value: boolean) { this.buttonEl.disabled = value; return this; }
        onClick(fn: () => void) { this.buttonEl.addEventListener('click', fn); return this; }
    },
    setIcon: (el: HTMLElement, icon: string) => { el.dataset.icon = icon; },
}));
const openedReviews = vi.hoisted(() => [] as Array<{ cards: unknown[]; title: string }>);
vi.mock('../src/ui/ReviewModal', () => ({ ReviewModal: class {
    constructor(_app: unknown, _plugin: unknown, cards: unknown[], title: string) { openedReviews.push({ cards, title }); }
    open() {}
} }));
vi.mock('../src/ui/StatsModal', () => ({}));
vi.mock('../src/ui/CustomStudyModal', () => ({}));
vi.mock('../src/ui/HelpModal', () => ({}));
vi.mock('../src/ui/BrowseModal', () => ({}));
vi.mock('../src/ui/CreateCardModal', () => ({}));
vi.mock('../src/ui/CreateDeckModal', () => ({}));
vi.mock('../src/database/PouchDBManager', () => ({}));

import { DashboardView } from '../src/ui/DashboardView';
import { DataManager } from '../src/data/DataManager';
import { buildDeckFolders } from '../src/data/deckFolders';
import { DEFAULT_SETTINGS } from '../src/data/constants';
import type { Deck } from '../src/data/types';

type Options = { cls?: string; text?: string; attr?: Record<string, string> };
beforeAll(() => {
    const make = (parent: HTMLElement, tag: string, opts?: Options) => {
        const el = document.createElement(tag);
        el.className = opts?.cls ?? '';
        el.textContent = opts?.text ?? '';
        for (const [key, value] of Object.entries(opts?.attr ?? {})) el.setAttribute(key, value);
        parent.append(el);
        return el;
    };
    Object.assign(HTMLElement.prototype, {
        createDiv(this: HTMLElement, opts?: Options) { return make(this, 'div', opts); },
        createSpan(this: HTMLElement, opts?: Options) { return make(this, 'span', opts); },
        createEl(this: HTMLElement, tag: string, opts?: Options) { return make(this, tag, opts); },
        toggleClass(this: HTMLElement, cls: string, on: boolean) { this.classList.toggle(cls, on); },
        addClass(this: HTMLElement, cls: string) { this.classList.add(cls); },
        setText(this: HTMLElement, text: string) { this.textContent = text; },
        hide(this: HTMLElement) { this.style.display = 'none'; },
        show(this: HTMLElement) { this.style.display = ''; },
        empty(this: HTMLElement) { this.replaceChildren(); },
    });
});

function deck(filePath: string, due = 0): Deck {
    return { id: filePath, filePath, title: filePath.split('/').pop()!, cardIds: new Set(), stats: { new: 0, due, learning: 0 } };
}

function setup(decks: Deck[]) {
    const plugin = {
        settings: { ...DEFAULT_SETTINGS, usePouchDB: false },
        saveSettings: vi.fn().mockResolvedValue(undefined),
    };
    const manager = new DataManager(plugin as never);
    vi.spyOn(manager, 'getDecks').mockReturnValue(decks);
    vi.spyOn(manager, 'isDataLoaded').mockReturnValue(true);
    const view = new DashboardView({} as never, { ...plugin, dataManager: manager } as never);
    vi.spyOn(view as unknown as { renderHeader(): void }, 'renderHeader').mockImplementation(() => {});
    return { view, plugin, manager };
}

function header(view: DashboardView, path: string): HTMLElement {
    return view.contentEl.querySelector<HTMLElement>(`[data-folder-path="${path}"] > .fsrs-folder-heading > .fsrs-folder-header`)!;
}

describe('Dashboard folders', () => {
    it('builds missing ancestors, nests decks and sums descendant counts', () => {
        const folders = buildDeckFolders([
            deck('Flashcards/Science/Biology/Cells.md', 3),
            deck('Flashcards/Overview.md', 2),
            deck('Flashcards/Science/Chemistry/Atoms.md', 4),
        ]);
        expect(folders).toHaveLength(1);
        expect(folders[0]).toMatchObject({ path: 'Flashcards', deckCount: 3, dueCount: 9 });
        const science = folders[0].folders[0];
        expect(science).toMatchObject({ path: 'Flashcards/Science', deckCount: 2, dueCount: 7 });
        expect(science.folders.map(f => f.name)).toEqual(['Biology', 'Chemistry']);
        expect(science.folders[0].decks[0].title).toBe('Cells.md');
    });

    it('keeps vault-root decks separate from a folder literally named Root', () => {
        const folders = buildDeckFolders([deck('Home.md'), deck('Root/Other.md')]);
        expect(folders.map(f => f.path).sort()).toEqual(['', 'Root']);
        expect(folders.every(f => f.deckCount === 1)).toBe(true);
        expect(buildDeckFolders([])).toEqual([]);
    });

    it('renders nested folders and preserves expansion after opening a deck, rerendering and recreating the view', async () => {
        const { view, plugin, manager } = setup([deck('Flashcards/Science/Cells.md', 3)]);
        view.render();
        const parent = header(view, 'Flashcards');
        const child = header(view, 'Flashcards/Science');
        expect(parent.getAttribute('aria-expanded')).toBe('false');
        expect(child.closest('.fsrs-folder-decks')?.parentElement?.dataset.folderPath).toBe('Flashcards');
        parent.click();
        child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        view.contentEl.querySelector<HTMLElement>('.fsrs-deck-row')!.click();
        expect(view.app.workspace.openLinkText).toHaveBeenCalledWith('Flashcards/Science/Cells.md', 'Flashcards/Science/Cells.md');
        view.render();
        expect(header(view, 'Flashcards').getAttribute('aria-expanded')).toBe('true');
        expect(header(view, 'Flashcards/Science').getAttribute('aria-expanded')).toBe('true');
        expect(plugin.saveSettings).toHaveBeenCalledTimes(2);

        const restored = setup(manager.getDecks());
        Object.assign(restored.plugin.settings, JSON.parse(JSON.stringify(plugin.settings)));
        restored.view.render();
        expect(header(restored.view, 'Flashcards/Science').getAttribute('aria-expanded')).toBe('true');
        header(restored.view, 'Flashcards').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        restored.view.render();
        expect(header(restored.view, 'Flashcards').getAttribute('aria-expanded')).toBe('false');
        expect(header(restored.view, 'Flashcards/Science').getAttribute('aria-expanded')).toBe('true');
        await Promise.resolve();
    });

    it('tracks equal folder names independently by full path', async () => {
        const { manager } = setup([]);
        await manager.setDashboardFolderExpanded('Flashcards/Science', true);
        expect(manager.isDashboardFolderExpanded('Archive/Science')).toBe(false);
        await manager.setDashboardFolderExpanded('Flashcards/Science', false);
        expect(manager.isDashboardFolderExpanded('Flashcards/Science')).toBe(false);
    });
});


it('opens deck links from the keyboard and preserves scroll across refreshes and views', () => {
    const { view, manager, plugin } = setup([deck('Flashcards/One.md')]);
    view.render();
    view.contentEl.scrollTop = 420;
    const link = view.contentEl.querySelector<HTMLElement>('.fsrs-deck-row-title')!;
    expect(link.tagName).toBe('A');
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(view.app.workspace.openLinkText).toHaveBeenCalledTimes(1);
    expect(manager.getDashboardScrollTop()).toBe(420);
    view.render();
    expect(view.contentEl.scrollTop).toBe(420);
    const recreated = new DashboardView({} as never, { ...plugin, dataManager: manager } as never);
    vi.spyOn(recreated as unknown as { renderHeader(): void }, 'renderHeader').mockImplementation(() => {});
    recreated.render();
    expect(recreated.contentEl.scrollTop).toBe(420);
});

it('studies a folder without toggling it and displays the limited queue size', () => {
    const { view, manager } = setup([deck('Flashcards/Science/One.md', 12)]);
    const card = { id: 'available' };
    vi.spyOn(manager, 'getReviewQueue').mockReturnValue([card] as never);
    view.render();
    const study = view.contentEl.querySelector<HTMLButtonElement>('[data-folder-path="Flashcards"] > .fsrs-folder-heading > button')!;
    expect(study.getAttribute('aria-label')).toContain('1 cards available');
    study.click();
    expect(openedReviews.at(-1)).toEqual({ cards: [card], title: 'Flashcards' });
    expect(header(view, 'Flashcards').getAttribute('aria-expanded')).toBe('false');
    expect(view.contentEl.querySelector('.fsrs-stat-available')?.textContent).toBe('1 available');
    expect(view.contentEl.querySelector('.fsrs-deck-row-actions button')?.getAttribute('aria-label')).toBe('Study 1 available cards');
});

it('offers an accessible retry when progress could not be saved', async () => {
    const { view, manager } = setup([deck('Deck.md')]);
    const error = vi.spyOn(manager, 'getSaveError').mockReturnValue('Disk full');
    const retry = vi.spyOn(manager, 'retrySave').mockImplementation(async () => { error.mockReturnValue(null); });
    view.render();
    const banner = view.contentEl.querySelector('[role="alert"]')!;
    expect(banner.textContent).toContain('Disk full');
    banner.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(view.contentEl.querySelector('[role="alert"]')).toBeNull());
    expect(retry).toHaveBeenCalledOnce();
});


it('shows the actual available count separately from total due cards', () => {
    const { view, manager } = setup([deck('Flashcards/One.md', 12)]);
    vi.mocked((view as unknown as { renderHeader(): void }).renderHeader).mockRestore();
    vi.spyOn(manager, 'getReviewQueue').mockReturnValue([{ id: 'available' }] as never);
    view.render();
    expect(view.contentEl.querySelector('.fsrs-action-badge')?.textContent).toBe('1');
    expect(view.contentEl.querySelector('.fsrs-stat-pill-due .fsrs-stat-pill-value')?.textContent).toBe('12');
    expect(view.contentEl.textContent).toContain('available today');
});
