import { afterEach, describe, expect, it, vi } from 'vitest';
import { Rating, State, createEmptyCard } from 'ts-fsrs';

vi.hoisted(() => { Object.assign(globalThis, { self: globalThis }); });
import 'fake-indexeddb/auto';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', () => ({
    Notice: class { constructor(text: string) { notices.push(text); } hide() {} },
    TFile: class {},
}));

import { DataManager } from '../src/data/DataManager';
import { DEFAULT_SETTINGS } from '../src/data/constants';
import type { PluginData } from '../src/data/types';

let counter = 0;
const managers: DataManager[] = [];
async function create(paths = ['Flashcards/Science/One.md']) {
    const files = paths.map(path => ({ path, basename: path.split('/').pop()!, stat: { mtime: 1 } }));
    let saved: PluginData | null = null;
    const plugin = {
        app: {
            vault: { getMarkdownFiles: () => files, read: async () => 'Question::Answer' },
            metadataCache: { getFileCache: () => ({ frontmatter: { tags: ['flashcards', 'review'] } }) },
        },
        settings: { ...DEFAULT_SETTINGS, gamification: { ...DEFAULT_SETTINGS.gamification }, usePouchDB: true, databaseName: `lifecycle_${++counter}` },
        loadData: async () => saved,
        saveData: vi.fn(async (data: PluginData) => { saved = data; }),
        refreshDashboardView: vi.fn(),
    };
    const dm = new DataManager(plugin as never);
    managers.push(dm);
    await dm.load();
    return { dm, plugin, files, saved: () => saved! };
}

afterEach(async () => {
    for (const dm of managers.splice(0)) {
        await dm.save();
        await dm.getPouchDB()!.close();
    }
    vi.restoreAllMocks();
});

describe('incoming review sync', () => {
    it('applies schedules and history to live cards, notes, dashboard and data.json', async () => {
        const { dm, plugin, files, saved } = await create();
        const card = dm.getAllCards()[0];
        const state = createEmptyCard();
        state.state = State.Review;
        state.reps = 5;
        state.due = new Date(Date.now() - 1000);
        const db = dm.getPouchDB()!;
        await db.saveCardState(card.id, card.deckId, card.filePath, state);
        await db.saveCardState(`note::${files[0].path}`, '', files[0].path, state);
        await db.addReviewLog(card.id, Date.now(), Rating.Good);
        await dm.refreshFromSync();
        expect(card.fsrsData?.reps).toBe(5);
        expect(dm.getAllReviewNotes()[0].fsrsData?.reps).toBe(5);
        expect(dm.getDecks()[0].stats).toEqual({ new: 0, due: 1, learning: 0 });
        expect(dm.getReviewHistory()).toHaveLength(1);
        expect(dm.getGamificationStats().totalCardsReviewed).toBe(1);
        expect(saved().cardData[card.id].reps).toBe(5);
        expect(saved().reviewHistory).toHaveLength(1);
        expect(plugin.refreshDashboardView).toHaveBeenCalled();

        await db.clearReviewProgress();
        await dm.refreshFromSync();
        expect(card.fsrsData).toBeUndefined();
        expect(dm.getGamificationStats()).toEqual(DEFAULT_SETTINGS.gamification);
        expect(saved().cardData).toEqual({});
        expect(dm.getAllReviewNotes()[0].fsrsData).toBeUndefined();
    });

    it('retries the read if a local review arrives during a sync refresh', async () => {
        const { dm, saved } = await create();
        const card = dm.getAllCards()[0];
        const db = dm.getPouchDB()!;
        const read = db.getAllCardStates.bind(db);
        let release: (value: Awaited<ReturnType<typeof read>>) => void = () => {};
        const reads = vi.spyOn(db, 'getAllCardStates').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const refresh = dm.refreshFromSync();
        await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce());
        dm.updateCard(card, Rating.Good);
        release({});
        await refresh;
        expect(reads).toHaveBeenCalledTimes(2);
        expect(card.fsrsData?.reps).toBe(1);
        expect(saved().cardData[card.id].reps).toBe(1);
        expect(saved().reviewHistory).toHaveLength(1);
    });

    it('does not overwrite progress when reading IndexedDB fails', async () => {
        const { dm, saved } = await create();
        const card = dm.getAllCards()[0];
        dm.updateCard(card, Rating.Good);
        await dm.save();
        vi.spyOn(dm.getPouchDB()!, 'getAllCardStates').mockRejectedValueOnce(new Error('Read failed'));
        await expect(dm.refreshFromSync()).rejects.toThrow('Read failed');
        expect(card.fsrsData?.reps).toBe(1);
        expect(saved().reviewHistory).toHaveLength(1);
        await dm.refreshFromSync();
        expect(card.fsrsData?.reps).toBe(1);
    });

    it('refreshes only for incoming replication events', async () => {
        const { dm, plugin } = await create();
        plugin.settings.syncEnabled = true;
        plugin.settings.syncUrl = 'https://example.invalid';
        const db = dm.getPouchDB()!;
        let change: (info: unknown) => void = () => {};
        vi.spyOn(db, 'onSyncChange').mockImplementation(handler => { change = handler; });
        vi.spyOn(db, 'setupSync').mockResolvedValue(undefined);
        const refresh = vi.spyOn(dm, 'refreshFromSync').mockResolvedValue(undefined);
        await dm.initializeSync();
        change({ direction: 'push' });
        expect(refresh).not.toHaveBeenCalled();
        change({ direction: 'pull' });
        expect(refresh).toHaveBeenCalledOnce();
    });
});

describe('deleted vault paths', () => {
    it('cleans schedules for folders, whole-note reviews and orphan states while retaining history', async () => {
        const { dm, files, saved } = await create(['Flashcards/Science/One.md', 'Flashcards/Science/Two.md', 'Flashcards/Science-extra/Keep.md']);
        const card = dm.getAllCards()[0];
        dm.updateCard(card, Rating.Good);
        dm.rateNote(files[0].path, Rating.Good);
        const db = dm.getPouchDB()!;
        await db.saveCardState('orphan', 'old-deck', 'Flashcards/Science/Old.md', createEmptyCard());
        await dm.removePath('Flashcards/Science');
        expect(dm.getDecks().map(deck => deck.filePath)).toEqual(['Flashcards/Science-extra/Keep.md']);
        expect(dm.getAllReviewNotes().map(note => note.filePath)).toEqual(['Flashcards/Science-extra/Keep.md']);
        expect(dm.getReviewHistory()).toHaveLength(2);
        expect(dm.canUndo()).toBe(false);
        expect(await db.getAllCardStates()).toEqual({});
        expect(saved().cardData).toEqual({});
        expect(saved().reviewHistory).toHaveLength(2);
    });

    it('retains progress when a deck is temporarily removed from the index', async () => {
        const { dm, files } = await create();
        const card = dm.getAllCards()[0];
        dm.updateCard(card, Rating.Good);
        dm.removeDeck(card.deckId, false);
        files[0].stat.mtime++;
        await dm.updateFile(files[0] as never);
        expect(dm.getAllCards()[0].fsrsData?.reps).toBe(1);
    });
});

describe('persistence feedback', () => {
    it('reports a failed vault write and retries with the latest progress', async () => {
        const { dm, plugin, saved } = await create();
        plugin.saveData.mockRejectedValueOnce(new Error('Disk full'));
        await expect(dm.save()).rejects.toThrow('Disk full');
        expect(dm.getSaveError()).toBe('Disk full');
        expect(notices.at(-1)).toContain('could not save progress');
        await dm.retrySave();
        expect(dm.getSaveError()).toBeNull();
        expect(saved().settings).toBeDefined();
    });

    it('keeps a database failure visible after a successful JSON save and repairs it on retry', async () => {
        const { dm, saved } = await create();
        const card = dm.getAllCards()[0];
        const db = dm.getPouchDB()!;
        vi.spyOn(db, 'saveCardState').mockRejectedValueOnce(new Error('IndexedDB write failed'));
        dm.updateCard(card, Rating.Good);
        await vi.waitFor(() => expect(dm.getSaveError()).toBe('IndexedDB write failed'));
        await dm.save();
        expect(dm.getSaveError()).toBe('IndexedDB write failed');
        await dm.retrySave();
        expect(dm.getSaveError()).toBeNull();
        expect((await db.getAllCardStates())[card.id].reps).toBe(1);
        expect(await db.getReviewHistory()).toHaveLength(1);
        expect(saved().cardData[card.id].reps).toBe(1);
    });
});

it('adds and removes the actual XP recorded by another device without changing local XP', async () => {
    const { dm } = await create(['Local.md', 'Remote.md']);
    const [local, remote] = dm.getAllCards();
    dm.updateCard(local, Rating.Good);
    await dm.save();
    const localXp = dm.getGamificationStats().totalXp;
    const db = dm.getPouchDB()!;
    const timestamp = Date.now() + 1000;
    await db.saveCardState(remote.id, remote.deckId, remote.filePath, createEmptyCard());
    await db.addReviewLog(remote.id, timestamp, Rating.Easy, 7);
    await dm.refreshFromSync();
    expect(dm.getGamificationStats().totalXp).toBe(localXp + 7);
    expect(dm.getGamificationStats().totalCardsReviewed).toBe(2);
    await db.deleteReviewLog(remote.id, timestamp);
    await dm.refreshFromSync();
    expect(dm.getGamificationStats().totalXp).toBe(localXp);
    expect(dm.getGamificationStats().totalCardsReviewed).toBe(1);
});

it('includes only the selected folder and descendants and respects daily limits', async () => {
    const { dm, plugin } = await create(['Root.md', 'Flashcards/Science/One.md', 'Flashcards/Science/Nested/Two.md', 'Flashcards/Science-extra/Other.md']);
    expect(dm.getFolderReviewQueue('Flashcards/Science').map(card => card.filePath).sort()).toEqual([
        'Flashcards/Science/Nested/Two.md', 'Flashcards/Science/One.md',
    ]);
    expect(dm.getFolderReviewQueue('').map(card => card.filePath)).toEqual(['Root.md']);
    plugin.settings.newCardsPerDay = 0;
    expect(dm.getFolderReviewQueue('Flashcards/Science')).toEqual([]);
});

it('coalesces overlapping sync refreshes and rereads when another pull arrives', async () => {
    const { dm } = await create();
    const db = dm.getPouchDB()!;
    let release: (states: object) => void = () => {};
    const reads = vi.spyOn(db, 'getAllCardStates').mockImplementationOnce(() => new Promise(resolve => { release = resolve as never; }));
    const first = dm.refreshFromSync();
    await vi.waitFor(() => expect(reads).toHaveBeenCalledOnce());
    const second = dm.refreshFromSync();
    expect(first).toBe(second);
    release({});
    await first;
    expect(reads).toHaveBeenCalledTimes(2);
});
