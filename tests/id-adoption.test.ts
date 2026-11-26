import { describe, it, expect, vi } from 'vitest';
import { Rating, State } from 'ts-fsrs';

vi.hoisted(() => {
    Object.assign(globalThis, { self: globalThis });
});

import 'fake-indexeddb/auto';

vi.mock('obsidian', () => ({
    Notice: class {},
    TFile: class {},
}));

import { DataManager } from '../src/data/DataManager';
import { DEFAULT_SETTINGS } from '../src/data/constants';

const PLAIN = '```mgo\nQuestion\n---\nAnswer\n```';
const WITH_ID = '```mgo\n---\nid: a1b2-c3d4\n---\nQuestion\n---\nAnswer\n```';
const WITH_ID_EDITED = '```mgo\n---\nid: a1b2-c3d4\n---\nQuestion edited\n---\nAnswer\n```';

function createManager(initialContent: string, settings: Record<string, unknown> = {}) {
    let content = initialContent;
    const file = { path: 'Decks/Id.md', basename: 'Id', extension: 'md', stat: { mtime: 1 } };
    const plugin = {
        app: {
            vault: { getMarkdownFiles: () => [file], read: async () => content },
            metadataCache: { getFileCache: () => ({ frontmatter: { tags: ['flashcards'] } }) },
        },
        settings: { ...DEFAULT_SETTINGS, usePouchDB: false, ...settings },
        loadData: async () => null,
        saveData: async () => undefined,
    };
    return {
        file,
        dm: new DataManager(plugin as never),
        setContent: (next: string) => { content = next; },
    };
}

describe('card id pins progress', () => {
    it('adopts progress when an id is added to an existing card', async () => {
        const { file, dm, setContent } = createManager(PLAIN);
        await dm.buildIndex();

        const [first] = dm.getAllCards();
        dm.updateCard(first, Rating.Good);
        const oldId = first.id;
        expect(first.fsrsData?.reps).toBe(1);

        setContent(WITH_ID);
        file.stat.mtime = 2;
        await dm.updateFile(file as never);

        const [next] = dm.getAllCards();
        expect(next.id).not.toBe(oldId);
        expect(next.id.endsWith('::a1b2-c3d4')).toBe(true);
        expect(next.fsrsData?.reps).toBe(1);
        expect(next.fsrsData?.state).not.toBe(State.New);
        expect(dm.getReviewHistory()).toHaveLength(1);
        expect(dm.getReviewHistory()[0].cardId).toBe(next.id);
        expect(dm.getDecks()[0].stats.new).toBe(0);
    });

    it('keeps the same id after the card text changes', async () => {
        const { file, dm, setContent } = createManager(WITH_ID);
        await dm.buildIndex();

        const [card] = dm.getAllCards();
        dm.updateCard(card, Rating.Good);
        const id = card.id;

        setContent(WITH_ID_EDITED);
        file.stat.mtime = 2;
        await dm.updateFile(file as never);

        const [next] = dm.getAllCards();
        expect(next.id).toBe(id);
        expect(next.front).toBe('Question edited');
        expect(next.fsrsData?.reps).toBe(1);
    });

    it('persists the adopted state in PouchDB across a restart', async () => {
        const databaseName = `mgo-id-adoption-${Math.random().toString(36).slice(2)}`;
        const first = createManager(PLAIN, { usePouchDB: true, databaseName });
        await first.dm.load();
        first.dm.updateCard(first.dm.getAllCards()[0], Rating.Good);
        await new Promise((resolve) => setTimeout(resolve, 200));

        const oldId = first.dm.getAllCards()[0].id;
        first.setContent(WITH_ID);
        first.file.stat.mtime = 2;
        await first.dm.updateFile(first.file as never);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await first.dm.getPouchDB()!.close();

        const second = createManager(WITH_ID, { usePouchDB: true, databaseName });
        await second.dm.load();
        const [card] = second.dm.getAllCards();
        expect(card.id).not.toBe(oldId);
        expect(card.fsrsData?.reps).toBe(1);
        expect(second.dm.getReviewHistory()).toHaveLength(1);
        expect(second.dm.getReviewHistory()[0].cardId).toBe(card.id);
        await second.dm.getPouchDB()!.close();
    });
});