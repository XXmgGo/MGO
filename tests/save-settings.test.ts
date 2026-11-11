import { describe, it, expect, vi } from 'vitest';
import { Rating } from 'ts-fsrs';

vi.hoisted(() => {
    Object.assign(globalThis, { self: globalThis });
});

vi.mock('obsidian', () => {
    const stub = class {};
    return {
        addIcon: () => {}, ButtonComponent: stub, Component: stub, debounce: (fn: unknown) => fn,
        ItemView: stub, MarkdownRenderer: stub, Modal: stub, Notice: class { hide() {} }, Plugin: stub,
        PluginSettingTab: stub, setIcon: () => {}, Setting: stub, TFile: stub,
    };
});
vi.mock('../src/database/PouchDBManager', () => ({
    PouchDBManager: class {
        async saveCardState() {}
        async addReviewLog() {}
    },
}));

import { FSRSFlashcardsPlugin } from '../src/plugin/main';
import { DataManager } from '../src/data/DataManager';
import { DEFAULT_SETTINGS } from '../src/data/constants';

async function savedPayload(usePouchDB: boolean) {
    const saveData = vi.fn().mockResolvedValue(undefined);
    const plugin = {
        app: {
            vault: { getMarkdownFiles: () => [], read: async () => '' },
            metadataCache: { getFileCache: () => null },
        },
        settings: { ...DEFAULT_SETTINGS, usePouchDB },
        saveData,
        loadData: async () => null,
        dataManager: undefined as unknown as DataManager,
    };
    plugin.dataManager = new DataManager(plugin as never);
    plugin.dataManager.updateCard({
        id: 'deck::card', deckId: 'deck', filePath: 'a.md', type: 'basic', originalText: '', front: 'f', back: 'b',
    }, Rating.Good);
    saveData.mockClear();

    await FSRSFlashcardsPlugin.prototype.saveSettings.call(plugin as never);
    return saveData.mock.calls.at(-1)![0] as { settings: { usePouchDB: boolean }; cardData: object; reviewHistory: unknown[] };
}

describe('saveSettings', () => {
    it('writes card data and review history to data.json in PouchDB mode', async () => {
        const payload = await savedPayload(true);
        expect(Object.keys(payload.cardData)).toEqual(['deck::card']);
        expect(payload.reviewHistory).toHaveLength(1);
        expect(payload.settings.usePouchDB).toBe(true);
    });

    it('keeps card data and review history in data.json in legacy JSON mode', async () => {
        const payload = await savedPayload(false);
        expect(Object.keys(payload.cardData)).toEqual(['deck::card']);
        expect(payload.reviewHistory).toHaveLength(1);
    });
});


it('serializes saves and freezes each snapshot before later changes', async () => {
    const writes: Array<{ settings: { fontSize: number } }> = [];
    let finishFirst: () => void = () => {};
    const saveData = vi.fn(async (data: { settings: { fontSize: number } }) => {
        if (writes.length === 0) {
            writes.push(data);
            await new Promise<void>(resolve => { finishFirst = resolve; });
        } else writes.push(data);
    });
    const plugin = { settings: { ...DEFAULT_SETTINGS, usePouchDB: false, fontSize: 16 }, saveData };
    const dm = new DataManager(plugin as never);
    const first = dm.save();
    await Promise.resolve();
    plugin.settings.fontSize = 20;
    const second = dm.save();
    await Promise.resolve();
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(writes[0].settings.fontSize).toBe(16);
    finishFirst();
    await Promise.all([first, second]);
    expect(writes.map(write => write.settings.fontSize)).toEqual([16, 20]);
});

it('allows a later save to succeed after a failed write', async () => {
    const saveData = vi.fn().mockRejectedValueOnce(new Error('Disk unavailable')).mockResolvedValue(undefined);
    const dm = new DataManager({ settings: { ...DEFAULT_SETTINGS, usePouchDB: false }, saveData } as never);
    await expect(dm.save()).rejects.toThrow('Disk unavailable');
    await expect(dm.save()).resolves.toBeUndefined();
    expect(saveData).toHaveBeenCalledTimes(2);
});
