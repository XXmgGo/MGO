vi.mock('obsidian', () => {
    class MockNotice {
        constructor(public message: string, public duration?: number) {}
    }
    class MockComponent {
        unload() {}
    }
    class MockTFile {
        path: string;
        basename: string;
        constructor(path: string, basename?: string) {
            this.path = path;
            this.basename = basename || path.split('/').pop() || 'untitled';
        }
    }
    return {
        Notice: MockNotice,
        TFile: MockTFile,
        Component: MockComponent,
        Plugin: class {},
        ItemView: class {
            contentEl = document.createElement('div');
            getViewType() { return ''; }
            getDisplayText() { return ''; }
            getIcon() { return ''; }
            onOpen() { return Promise.resolve(); }
        },
        Modal: class {
            app: any;
            contentEl = document.createElement('div');
            containerEl = document.createElement('div');
            modalEl = document.createElement('div');
            titleEl = document.createElement('div');
            scope = { register: () => {} };
            constructor(app: any) { this.app = app; }
            open() {}
            close() {}
        },
        Setting: class {
            setName() { return this; }
            setDesc() { return this; }
            setHeading() { return this; }
            addText() { return this; }
            addToggle() { return this; }
            addDropdown() { return this; }
            addButton() { return this; }
            addSlider() { return this; }
            setDisabled() { return this; }
        },
        ButtonComponent: class {
            buttonEl = document.createElement('div');
            setIcon() { return this; }
            setButtonText() { return this; }
            setCta() { return this; }
            setWarning() { return this; }
            setDisabled() { return this; }
            setTooltip() { return this; }
            onClick() { return this; }
        },
        setIcon: () => {},
        debounce: (fn: any) => fn,
        MarkdownRenderer: class { static render() { return Promise.resolve(); } },
        normalizePath: (p: string) => p.replace(/\\/g, '/'),
        Platform: { isDesktop: true, isMobile: false },
    };
});

vi.mock('../src/database/PouchDBManager', () => {
    class MockPouchDBManager {
        constructor() {}
        async getAllCardStates() { return {}; }
        async getReviewHistory() { return []; }
        async saveCardState() { return Promise.resolve(); }
        async addReviewLog() { return Promise.resolve(); }
        async destroy() { return Promise.resolve(); }
        async setupSync() { return Promise.resolve(); }
        async stopSync() { return Promise.resolve(); }
        async manualSync() { return Promise.resolve(); }
        async getSyncStatus() { return { enabled: false }; }
        async getDatabaseInfo() { return { doc_count: 0 }; }
        async testConnection() { return { remoteInfo: {}, localInfo: {} }; }
        isSyncing() { return false; }
        onSyncChange() {}
        onSyncError() {}
        onSyncActive() {}
        onSyncPaused() {}
    }
    return { PouchDBManager: MockPouchDBManager };
});

import { describe, it, expect, vi } from 'vitest';
import { DataManager } from '../src/data/DataManager';
import { DEFAULT_SETTINGS } from '../src/data/constants';

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```';

function createMockPlugin() {
    const app = {
        vault: {
            getMarkdownFiles: vi.fn().mockReturnValue([]),
            read: vi.fn().mockResolvedValue(''),
            on: vi.fn().mockReturnValue(vi.fn()),
        },
        metadataCache: {
            getFileCache: vi.fn().mockReturnValue(null),
            getCache: vi.fn().mockReturnValue(null),
        },
        workspace: {
            getLeavesOfType: vi.fn().mockReturnValue([]),
            revealLeaf: vi.fn().mockResolvedValue(undefined),
            getLeaf: vi.fn().mockReturnValue({ setViewState: vi.fn().mockResolvedValue(undefined) }),
            rootSplit: {},
            on: vi.fn().mockReturnValue(vi.fn()),
        },
    };
    return {
        app,
        settings: { ...DEFAULT_SETTINGS },
        loadData: vi.fn().mockResolvedValue(null),
        saveData: vi.fn().mockResolvedValue(undefined),
        saveSettings: vi.fn().mockResolvedValue(undefined),
        refreshDashboardView: vi.fn(),
    };
}

function deckPlugin(content: string) {
    const plugin = createMockPlugin();
    plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
        frontmatter: { MGO: 'flashcards' },
    });
    plugin.app.vault.read = vi.fn().mockResolvedValue(content);
    return plugin;
}

async function parse(content: string, path = 'test-note.md') {
    const dm = new DataManager(deckPlugin(content) as never);
    await dm.updateFile({ path, basename: path.replace(/\.md$/, '') } as never);
    return dm;
}

describe('Card parsing', () => {
    describe('Basic cards', () => {
        it('parses a simple basic card', async () => {
            const dm = await parse(`---
MGO: flashcards
---

${fence('mgo', 'What is the capital of France?\n---\nParis')}
`);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('basic');
            expect(cards[0].front).toBe('What is the capital of France?');
            expect(cards[0].back).toBe('Paris');
        });

        it('parses multiple basic cards', async () => {
            const dm = await parse(`---
MGO: flashcards
---

${fence('mgo', 'Front 1\n---\nBack 1')}

${fence('mgo', 'Front 2\n---\nBack 2')}
`);
            expect(dm.getAllCards()).toHaveLength(2);
        });

        it('keeps multi-line fronts and backs', async () => {
            const dm = await parse(fence('mgo', 'Line one\nLine two\n---\nAnswer one\n\nAnswer two'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].front).toBe('Line one\nLine two');
            expect(cards[0].back).toBe('Answer one\n\nAnswer two');
        });

        it('keeps adjacent cards separate', async () => {
            const dm = await parse(`${fence('mgo', 'Question 1\n---\nAnswer 1\nLine 2 of answer')}\n${fence('mgo', 'Question 2\n---\nAnswer 2')}`);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards[0].back).toBe('Answer 1\nLine 2 of answer');
            expect(cards[0].front).not.toContain('Question 2');
            expect(cards[1].back).toBe('Answer 2');
        });

        it('skips blocks with an empty side or without a separator', async () => {
            const dm = await parse([
                fence('mgo', '\n---\nBack only - no front'),
                fence('mgo', 'Front only - no separator'),
                fence('mgo', 'Front\n---\n'),
            ].join('\n\n'));
            expect(dm.getAllCards()).toHaveLength(0);
        });

        it('does not treat colons in text as cards', async () => {
            const dm = await parse(`${fence('mgo', 'This is not::A card\n---\nThe real answer')}\n\nTime:: 12:30 is just plain prose outside a card.\n`);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].front).toBe('This is not::A card');
            expect(cards[0].back).toBe('The real answer');
        });

        it('gives every card a content-hash id', async () => {
            const dm = await parse(`${fence('mgo', 'First\n---\nOne')}\n\n${fence('mgo', 'Second\n---\nTwo')}`);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards[0].id).toMatch(/^[a-f0-9]+$/);
            expect(cards[0].id).not.toBe(cards[1].id);
        });

        it('ignores mgo fences with a different language', async () => {
            const dm = await parse(`${fence('javascript', 'const a = 1')}\n\n${fence('mgo', 'Real\n---\nCard')}`);
            expect(dm.getAllCards()).toHaveLength(1);
        });
    });

    describe('Reversed and type-in cards', () => {
        it('parses a reversed card', async () => {
            const dm = await parse(fence('mgo-reverse', 'Capital of France\n---\nParis'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('reversed');
            expect(cards[0].front).toBe('Paris');
            expect(cards[0].back).toBe('Capital of France');
        });

        it('parses a type-in card', async () => {
            const dm = await parse(fence('mgo-typein', 'Type the capital of France\n---\nParis'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('typein');
            expect(cards[0].front).toBe('Type the capital of France');
            expect(cards[0].back).toBe('Paris');
        });

        it('parses multiple cards of mixed types', async () => {
            const dm = await parse([
                fence('mgo', 'Q1\n---\nA1'),
                fence('mgo', 'Q2\n---\nA2'),
                fence('mgo-reverse', 'Q3\n---\nA3'),
            ].join('\n'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(3);
            expect(cards.map((c) => c.type).sort()).toEqual(['basic', 'basic', 'reversed']);
        });
    });

    describe('Cloze deletion cards', () => {
        it('parses a simple cloze card', async () => {
            const dm = await parse(fence('mgo', 'The ==c1::mitochondria== is the powerhouse of the cell.'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('cloze');
            expect(cards[0].front).toContain('[...]');
            expect(cards[0].back).toContain('mitochondria');
            expect(cards[0].back).not.toContain('==c1::');
        });

        it('creates separate cards for each cloze number', async () => {
            const dm = await parse(fence('mgo', 'The ==c1::mitochondria== is the powerhouse of the ==c2::cell==.'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards.every(c => c.type === 'cloze')).toBe(true);

            const c1Card = cards.find(c => c.front.includes('[...]') && c.front.includes('cell'));
            expect(c1Card).toBeDefined();
            expect(c1Card!.front).toBe('The [...] is the powerhouse of the cell.');
            expect(c1Card!.front).not.toContain('==c2::');

            const c2Card = cards.find(c => c.front.includes('[...]') && c.front.includes('mitochondria'));
            expect(c2Card).toBeDefined();
            expect(c2Card!.front).toBe('The mitochondria is the powerhouse of the [...].');
            expect(c2Card!.front).not.toContain('==c1::');
        });

        it('supports optional hints and shared cloze numbers', async () => {
            const dm = await parse(fence('mgo', '==c1::Canberra::capital== is in ==c2::Australia==, and ==c1::Wellington::capital== is in ==c2::New Zealand==.'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);

            const c1Card = cards.find(c => c.front.includes('[capital]'));
            expect(c1Card).toBeDefined();
            expect(c1Card!.front).toBe('[capital] is in Australia, and [capital] is in New Zealand.');
            expect(c1Card!.back).toBe('Canberra is in Australia, and Wellington is in New Zealand.');

            const c2Card = cards.find(c => c.front.includes('Canberra'));
            expect(c2Card).toBeDefined();
            expect(c2Card!.front).toBe('Canberra is in [...], and Wellington is in [...].');
            expect(c2Card!.back).toBe('Canberra is in Australia, and Wellington is in New Zealand.');
        });

        it('does not leak content between an adjacent basic card and a cloze card', async () => {
            const dm = await parse([
                fence('mgo', 'What are basic types?\n---\n| Type | Description |\n| `int` | Integer |'),
                fence('mgo', 'Use the ==c1::type()== function to check type.'),
            ].join('\n'));
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);

            const basicCard = cards.find(c => c.type === 'basic')!;
            expect(basicCard.front).toBe('What are basic types?');
            expect(basicCard.back).toBe('| Type | Description |\n| `int` | Integer |');

            const clozeCard = cards.find(c => c.type === 'cloze')!;
            expect(clozeCard.front).toBe('Use the [...] function to check type.');
            expect(clozeCard.back).toBe('Use the type() function to check type.');
            expect(clozeCard.front).not.toContain('What are basic types');
        });

        it('ignores cloze syntax outside an mgo block', async () => {
            const dm = await parse(`---
MGO: flashcards
---

Answer with ==c1::inline notation== written as plain prose.
`);
            expect(dm.getAllCards()).toHaveLength(0);
        });
    });

    describe('Context and decks', () => {
        it('falls back to the card front when neither title nor heading exists', async () => {
            const dm = await parse(`---
MGO: flashcards
# YAML comment
---

# Real Section

${fence('mgo', 'Question 1\n---\n    # Python comment inside code\n    print("hello")')}

${fence('mgo', 'Question 2\n---\nAnswer 2')}
`);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            // 没写 title：名称取卡片正面内容
            expect(cards[0].context).toBe('Question 1');
            expect(cards[1].context).toBe('Question 2');
        });

        it('ignores files without the deck tag', async () => {
            const plugin = createMockPlugin();
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({ tags: [] });
            plugin.app.vault.read = vi.fn().mockResolvedValue(fence('mgo', 'Front\n---\nBack'));
            const dm = new DataManager(plugin as never);
            await dm.updateFile({ path: 'no-deck-tag.md', basename: 'no-deck-tag' } as never);
            expect(dm.getAllCards()).toHaveLength(0);
            expect(dm.getDecks()).toHaveLength(0);
        });
    });
});