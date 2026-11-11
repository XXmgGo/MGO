import { describe, it, expect, vi } from 'vitest';
import { Rating, State } from 'ts-fsrs';

vi.hoisted(() => {
    Object.assign(globalThis, { self: globalThis });
});

import 'fake-indexeddb/auto';

vi.mock('obsidian', () => ({ Notice: class {}, TFile: class {} }));

import { DataManager } from '../src/data/DataManager';
import { parseBackup } from '../src/data/backup';
import { DEFAULT_SETTINGS } from '../src/data/constants';

const CONTENT = 'First::One\nSecond::Two\n';
const settle = () => new Promise((r) => setTimeout(r, 200));

function create(usePouchDB: boolean, databaseName: string, store?: { saved?: unknown }, reviewNote = false) {
    const file = { path: 'Decks/U.md', basename: 'U', extension: 'md', stat: { mtime: 1 } };
    const savedSettings = (store?.saved as { settings?: typeof DEFAULT_SETTINGS } | undefined)?.settings;
    const plugin = {
        app: {
            vault: { getMarkdownFiles: () => [file], read: async () => CONTENT },
            metadataCache: { getFileCache: () => ({ frontmatter: { tags: reviewNote ? ['flashcards', 'review'] : ['flashcards'] } }) },
        },
        settings: savedSettings
            ? { ...savedSettings, gamification: { ...savedSettings.gamification }, usePouchDB, databaseName }
            : { ...DEFAULT_SETTINGS, gamification: { ...DEFAULT_SETTINGS.gamification }, usePouchDB, databaseName },
        loadData: async () => store?.saved ?? null,
        saveData: async (data: unknown) => { if (store) store.saved = data; },
    };
    return { dm: new DataManager(plugin as never), plugin };
}

describe('undo last rating', () => {
    it('restores a never-rated card, its history and the streak counters', async () => {
        const { dm, plugin } = create(false, 'x');
        await dm.buildIndex();
        const card = dm.getAllCards()[0];
        expect(dm.canUndo()).toBe(false);

        dm.updateCard(card, Rating.Good);
        expect(card.fsrsData).toBeDefined();
        expect(plugin.settings.gamification.totalCardsReviewed).toBe(1);

        expect(dm.undoLastRating()).toBe(card);
        expect(card.fsrsData).toBeUndefined();
        expect(dm.getReviewHistory()).toHaveLength(0);
        expect(plugin.settings.gamification.totalCardsReviewed).toBe(0);
        expect(plugin.settings.gamification.totalXp).toBe(0);
        expect(dm.getStats().reviewsToday).toBe(0);
        expect(dm.canUndo()).toBe(false);
    });

    it('restores the previous schedule when undoing a second rating, most recent first', async () => {
        const { dm } = create(false, 'x');
        await dm.buildIndex();
        const card = dm.getAllCards()[0];
        dm.updateCard(card, Rating.Good);
        const afterFirst = { ...card.fsrsData! };
        dm.updateCard(card, Rating.Again);
        expect(card.fsrsData!.lapses).toBeGreaterThanOrEqual(0);

        dm.undoLastRating();
        expect(card.fsrsData).toEqual(afterFirst);
        expect(dm.getReviewHistory()).toHaveLength(1);
        dm.undoLastRating();
        expect(card.fsrsData).toBeUndefined();
        expect(dm.getReviewHistory()).toHaveLength(0);
    });

    it('is durable in PouchDB: after a restart the undone rating is gone', async () => {
        const first = create(true, 'undo_db');
        await first.dm.load();
        const [a, b] = first.dm.getAllCards();
        first.dm.updateCard(a, Rating.Good);
        first.dm.updateCard(b, Rating.Easy);
        await settle();
        first.dm.undoLastRating();
        await settle();
        await first.dm.getPouchDB()!.close();

        const second = create(true, 'undo_db');
        await second.dm.load();
        const cards = second.dm.getAllCards();
        const rated = cards.filter((c) => c.fsrsData && c.fsrsData.state !== State.New);
        expect(rated.map((c) => c.id)).toEqual([a.id]);
        expect(second.dm.getReviewHistory()).toHaveLength(1);
        await second.dm.getPouchDB()!.close();
    });

    it('persists and reconciles streak and XP across reloads', async () => {
        const store = { saved: undefined as unknown };
        const first = create(true, 'streak_xp_db', store);
        await first.dm.load();
        const [a] = first.dm.getAllCards();
        first.dm.updateCard(a, Rating.Good);
        await settle();

        const gamificationBefore = { ...first.plugin.settings.gamification };
        expect(gamificationBefore.totalCardsReviewed).toBe(1);
        expect(gamificationBefore.totalXp).toBeGreaterThan(0);
        expect(gamificationBefore.currentStreak).toBe(1);
        await first.dm.getPouchDB()!.close();

        // Second instance mimics a fresh app reload using the saved data on disk
        const second = create(true, 'streak_xp_db', store);
        await second.dm.load();

        const gamificationAfter = second.plugin.settings.gamification;
        expect(gamificationAfter.totalCardsReviewed).toBe(1);
        expect(gamificationAfter.totalXp).toBe(gamificationBefore.totalXp);
        expect(gamificationAfter.currentStreak).toBe(1);
        expect(gamificationAfter.longestStreak).toBe(1);
        await second.dm.getPouchDB()!.close();

        // Third instance mimics data.json missing, testing PouchDB review history recovery
        const third = create(true, 'streak_xp_db');
        await third.dm.load();
        const gamificationReconciled = third.plugin.settings.gamification;
        expect(gamificationReconciled.totalCardsReviewed).toBe(1);
        expect(gamificationReconciled.totalXp).toBeGreaterThan(0);
        expect(gamificationReconciled.currentStreak).toBe(1);
        expect(gamificationReconciled.longestStreak).toBe(1);
        await third.dm.getPouchDB()!.close();
    });
});


describe('reset all progress', () => {
    it.each([false, true])('clears counters, notes, schedules and undo durably (PouchDB: %s)', async (usePouchDB) => {
        const store = { saved: undefined as unknown };
        const name = `reset_progress_${usePouchDB}`;
        const first = create(usePouchDB, name, store, true);
        await first.dm.load();
        first.dm.updateCard(first.dm.getAllCards()[0], Rating.Good);
        first.dm.rateNote('Decks/U.md', Rating.Easy);
        expect(first.dm.canUndo()).toBe(true);
        expect(first.dm.getGamificationStats().totalXp).toBeGreaterThan(0);
        expect(first.dm.getAllReviewNotes()[0].fsrsData).toBeDefined();

        await first.dm.resetAllProgress();
        expect(first.dm.getReviewHistory()).toEqual([]);
        expect(first.dm.getGamificationStats()).toEqual(DEFAULT_SETTINGS.gamification);
        expect(first.dm.getAllCards().every(card => !card.fsrsData)).toBe(true);
        expect(first.dm.getAllReviewNotes()[0].fsrsData).toBeUndefined();
        expect(first.dm.canUndo()).toBe(false);
        expect(first.dm.undoLastRating()).toBeNull();
        expect(first.dm.getDecks()[0].stats).toEqual({ new: 2, due: 0, learning: 0 });
        await first.dm.getPouchDB()?.close();

        const second = create(usePouchDB, name, store, true);
        await second.dm.load();
        expect(second.dm.getGamificationStats()).toEqual(DEFAULT_SETTINGS.gamification);
        expect(second.dm.getReviewHistory()).toEqual([]);
        expect(second.dm.getAllCards().every(card => !card.fsrsData)).toBe(true);
        expect(second.dm.getAllReviewNotes()[0].fsrsData).toBeUndefined();
        await second.dm.getPouchDB()?.close();
    });
});

describe('automatic vault review data', () => {
    it('restores cards, whole-note schedules and history from data.json into an empty database', async () => {
        const store = { saved: undefined as unknown };
        const first = create(true, 'vault_copy_original', store, true);
        await first.dm.load();
        const card = first.dm.getAllCards()[0];
        first.dm.updateCard(card, Rating.Good);
        first.dm.rateNote('Decks/U.md', Rating.Good);
        await first.dm.save();
        const snapshot = JSON.parse(JSON.stringify(store.saved));
        expect(Object.keys(snapshot.cardData)).toEqual([card.id, 'note::Decks/U.md']);
        expect(snapshot.reviewHistory).toHaveLength(2);
        expect(snapshot.settings.gamification.totalXp).toBeGreaterThan(0);
        await settle();
        await first.dm.getPouchDB()!.close();

        store.saved = snapshot;
        const restored = create(true, 'vault_copy_new_device', store, true);
        await restored.dm.load();
        expect(restored.dm.getAllCards()[0].fsrsData?.due).toEqual(card.fsrsData?.due);
        expect(restored.dm.getAllReviewNotes()[0].fsrsData?.last_review).toBeInstanceOf(Date);
        expect(restored.dm.getReviewHistory()).toHaveLength(2);
        expect(restored.dm.getGamificationStats()).toEqual(first.dm.getGamificationStats());
        expect(Object.keys(await restored.dm.getPouchDB()!.getAllCardStates())).toHaveLength(2);
        expect(await restored.dm.getPouchDB()!.getReviewHistory()).toHaveLength(2);
        await restored.dm.getPouchDB()!.close();

        const again = create(true, 'vault_copy_new_device', store, true);
        await again.dm.load();
        expect(again.dm.getReviewHistory()).toHaveLength(2);
        await again.dm.resetAllProgress();
        expect((store.saved as { cardData: object }).cardData).toEqual({});
        expect((store.saved as { reviewHistory: unknown[] }).reviewHistory).toEqual([]);
        await again.dm.getPouchDB()!.close();

        const afterReset = create(true, 'vault_copy_after_reset', store, true);
        await afterReset.dm.load();
        expect(afterReset.dm.getReviewHistory()).toEqual([]);
        expect(afterReset.dm.getGamificationStats()).toEqual(DEFAULT_SETTINGS.gamification);
        expect(afterReset.dm.getAllCards().every(card => !card.fsrsData)).toBe(true);
        await afterReset.dm.getPouchDB()!.close();
    });

    it('copies existing IndexedDB data into data.json without importing an older vault copy over it', async () => {
        const first = create(true, 'vault_copy_existing');
        await first.dm.load();
        const card = first.dm.getAllCards()[0];
        first.dm.updateCard(card, Rating.Good);
        await first.dm.save();
        await settle();
        await first.dm.getPouchDB()!.close();

        const store = { saved: { settings: first.plugin.settings, cardData: {}, reviewHistory: [] } as unknown };
        const upgraded = create(true, 'vault_copy_existing', store);
        await upgraded.dm.load();
        const saved = store.saved as { cardData: Record<string, { reps: number }>; reviewHistory: unknown[] };
        expect(saved.cardData[card.id].reps).toBe(1);
        expect(saved.reviewHistory).toHaveLength(1);
        await upgraded.dm.getPouchDB()!.close();

        const jsonOnly = create(false, 'unused', store);
        await jsonOnly.dm.load();
        expect(jsonOnly.dm.getAllCards()[0].fsrsData?.reps).toBe(1);
        expect(jsonOnly.dm.getReviewHistory()).toHaveLength(1);
    });
});


it('updates the vault copy after undo and backup import', async () => {
    const store = { saved: undefined as unknown };
    const { dm } = create(true, 'vault_copy_undo_import', store);
    await dm.load();
    const card = dm.getAllCards()[0];
    dm.updateCard(card, Rating.Good);
    const backup = parseBackup(dm.exportBackup());
    dm.undoLastRating();
    await dm.save();
    expect((store.saved as { cardData: object }).cardData).toEqual({});
    expect((store.saved as { reviewHistory: unknown[] }).reviewHistory).toEqual([]);
    await settle();
    await dm.importBackup(backup);
    const saved = store.saved as { cardData: Record<string, unknown>; reviewHistory: unknown[] };
    expect(Object.keys(saved.cardData)).toEqual([card.id]);
    expect(saved.reviewHistory).toHaveLength(1);
    await dm.getPouchDB()!.close();
});
