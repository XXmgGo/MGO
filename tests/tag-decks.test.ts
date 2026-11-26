vi.mock('obsidian', () => {
    class MockNotice {
        constructor(public message: string, public duration?: number) {}
    }
    class MockComponent { unload() {} }
    return {
        Notice: MockNotice,
        TFile: class {
            path: string; basename: string;
            constructor(path: string, basename?: string) { this.path = path; this.basename = basename || path.split('/').pop() || 'untitled'; }
        },
        Component: MockComponent,
        Plugin: class {},
        debounce: (fn: unknown) => fn,
        normalizePath: (p: string) => p.replace(/\\/g, '/'),
    };
});

vi.mock('../src/database/PouchDBManager', () => {
    class MockPouchDBManager {
        async getAllCardStates() { return {}; }
        async getReviewHistory() { return []; }
        async saveCardState() { return Promise.resolve(); }
        async addReviewLog() { return Promise.resolve(); }
        async destroy() { return Promise.resolve(); }
        isSyncing() { return false; }
    }
    return { PouchDBManager: MockPouchDBManager };
});

import { describe, it, expect, vi } from 'vitest';
import { DataManager } from '../src/data/DataManager';
import { DEFAULT_SETTINGS } from '../src/data/constants';

function mockPlugin(deckTags: string[]) {
    const caches = new Map<string, unknown>();
    const contents = new Map<string, string>();
    const app = {
        vault: {
            getMarkdownFiles: vi.fn().mockReturnValue([]),
            read: vi.fn((file: { path: string }) => Promise.resolve(contents.get(file.path) ?? '')),
            on: vi.fn().mockReturnValue(vi.fn()),
        },
        metadataCache: {
            getFileCache: vi.fn((file: { path: string }) => caches.get(file.path) ?? null),
        },
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        fileManager: { processFrontMatter: vi.fn() },
    };
    return {
        app,
        settings: { ...DEFAULT_SETTINGS, deckTags, usePouchDB: false },
        loadData: vi.fn().mockResolvedValue(null),
        saveData: vi.fn().mockResolvedValue(undefined),
        manifest: { version: '0.0.0-test' },
        caches, contents,
    };
}

function mgoCache(path: string) {
    return { frontmatter: { MGO: path } };
}

function file(path: string) { return { path, basename: path.split('/').pop() }; }

describe('Tag-based decks', () => {
    it('merges cards from two notes with the same tag into one deck', async () => {
        const p = mockPlugin(['ja-card']);
        const dm = new DataManager(p as never);
        p.caches.set('A.md', mgoCache('ja-card'));
        p.caches.set('B.md', mgoCache('ja-card'));
        p.contents.set('A.md', `\`\`\`mgo\nQ1\n---\nA1\n\`\`\`\n`);
        p.contents.set('B.md', `\`\`\`mgo\nQ2\n---\nA2\n\`\`\`\n`);
        await dm.updateFile(file('A.md') as never);
        await dm.updateFile(file('B.md') as never);
        const decks = dm.getDecks();
        expect(decks).toHaveLength(1);
        expect(decks[0].tagPath).toBe('ja-card');
        expect(decks[0].cardIds.size).toBe(2);
        expect(dm.getCardsByDeck(decks[0].id)).toHaveLength(2);
    });

    it('nests subdecks by slash and a parent queue includes children', async () => {
        const p = mockPlugin(['ja-card']);
        const dm = new DataManager(p as never);
        p.caches.set('gram.md', mgoCache('ja-card/文法'));
        p.caches.set('vocab.md', mgoCache('ja-card/词汇'));
        p.contents.set('gram.md', `\`\`\`mgo\nQ1\n---\nA1\n\`\`\`\n`);
        p.contents.set('vocab.md', `\`\`\`mgo\nQ2\n---\nA2\n\`\`\`\n`);
        await dm.updateFile(file('gram.md') as never);
        await dm.updateFile(file('vocab.md') as never);
        expect(dm.getDecks().map(d => d.tagPath).sort()).toEqual(['ja-card/文法', 'ja-card/词汇']);
        // 父路径聚合：子树含两张卡
        const subtree = dm.getSubtreeStats('ja-card');
        expect(subtree.total).toBe(2);
        expect(dm.getSubtreeQueue('ja-card')).toHaveLength(2);
    });

    it('lists only a deck own cards, excluding subdecks', async () => {
        const p = mockPlugin(['ja-card']);
        const dm = new DataManager(p as never);
        p.caches.set('Parent.md', mgoCache('ja-card'));
        p.caches.set('Child.md', mgoCache('ja-card/文法'));
        p.contents.set('Parent.md', `\`\`\`mgo\nP\n---\nPA\n\`\`\`\n`);
        p.contents.set('Child.md', `\`\`\`mgo\nC\n---\nCA\n\`\`\`\n`);
        await dm.updateFile(file('Parent.md') as never);
        await dm.updateFile(file('Child.md') as never);

        const parent = dm.getDecks().find(d => d.tagPath === 'ja-card')!;
        const child = dm.getDecks().find(d => d.tagPath === 'ja-card/文法')!;
        // 复习作用域仍含子牌组
        expect(dm.getCardsByDeck(parent.id)).toHaveLength(2);
        // 仪表盘列表只显示标签本身命中的卡片
        expect(dm.getOwnCardsByDeck(parent.id).map(c => c.front)).toEqual(['P']);
        expect(dm.getOwnCardsByDeck(child.id).map(c => c.front)).toEqual(['C']);
        expect(dm.getOwnDeckStats(parent.id).new).toBe(1);
    });

    it('uses the first entry when MGO is a list', async () => {
        const p = mockPlugin(['ja-card', 'en-card']);
        const dm = new DataManager(p as never);
        p.caches.set('both.md', { frontmatter: { MGO: ['ja-card', 'en-card'] } });
        p.contents.set('both.md', `\`\`\`mgo\nQ\n---\nA\n\`\`\`\n`);
        const changed = await dm.updateFile(file('both.md') as never);
        expect(changed).toBe(true);
        expect(dm.getDecks()[0].tagPath).toBe('ja-card');
    });

    it('keeps card id (progress key) when only the MGO path changes', async () => {
        const p = mockPlugin(['flashcards']);
        const dm = new DataManager(p as never);
        p.caches.set('n.md', mgoCache('flashcards'));
        p.contents.set('n.md', `\`\`\`mgo\nQ\n---\nA\n\`\`\`\n`);
        await dm.updateFile(file('n.md') as never);
        const idBefore = dm.getAllCards()[0].id;
        // 把 MGO 改成子牌组后重新处理同一文件
        p.caches.set('n.md', mgoCache('flashcards/文法'));
        await dm.updateFile(file('n.md') as never);
        const card2 = dm.getAllCards()[0];
        // 卡片 id 由文件路径 + blockId 决定，与标签无关 → 进度键不变
        expect(card2.id).toBe(idBefore);
        expect(dm.getDecks()[0].tagPath).toBe('flashcards/文法');
    });

    it('a note without MGO is not a deck', async () => {
        const p = mockPlugin(['ja-card']);
        const dm = new DataManager(p as never);
        p.caches.set('other.md', { frontmatter: { tags: ['random'] } });
        p.contents.set('other.md', `Q::A ^z1\n`);
        const changed = await dm.updateFile(file('other.md') as never);
        expect(changed).toBe(false);
        expect(dm.getDecks()).toHaveLength(0);
    });
});
