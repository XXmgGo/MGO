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

describe('Card parsing', () => {
    describe('Basic cards', () => {
        it('parses a simple basic card', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="test123">
What is the capital of France?
<mgo-a>Paris</mgo-a>
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('basic');
            expect(cards[0].front).toBe('What is the capital of France?');
            expect(cards[0].back).toBe('Paris');
        });

        it('parses multiple basic cards', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="q1">
Front 1
<mgo-a>Back 1</mgo-a>
</mgo-card>

<mgo-card cardId="q2">
Front 2
<mgo-a>Back 2</mgo-a>
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            expect(dm.getAllCards()).toHaveLength(2);
        });

        it('handles cards without cardId', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card>
Front without block ID
<mgo-a>Back without block ID</mgo-a>
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            expect(dm.getAllCards()).toHaveLength(1);
            expect(dm.getAllCards()[0].id).not.toContain('::');
        });

        it('skips malformed cards with empty front', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="empty">
<mgo-a>Back only - no front</mgo-a>
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            expect(dm.getAllCards()).toHaveLength(0);
        });

        it('stops the card at </mgo-card> and keeps following headings out of card', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="py-list-02">
How do you access single elements and slices of a list?
<mgo-a>Use indexing: list[0]</mgo-a>
</mgo-card>

## 2. Next Section
This heading and text should not be part of the card!
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].front).toBe('How do you access single elements and slices of a list?');
            expect(cards[0].back).toBe('Use indexing: list[0]');
            expect(cards[0].back).not.toContain('Next Section');
            expect(cards[0].front).not.toContain('mgo-card');
        });

        it('supports single-line cards and card-id attribute name variants', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="card-1">Question 1<mgo-a>Answer 1</mgo-a></mgo-card>

Prose notes here

<mgo-card card-id="card-2">Question 2<mgo-a>Answer 2</mgo-a></mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards[0].back).toBe('Answer 1');
            expect(cards[1].back).toBe('Answer 2');
            expect(cards[1].id).toMatch(/::card-2$/);
        });

        it('keeps multi-line answers and adjacent cards separate', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="legacy-01">
Question 1
<mgo-a>Answer 1
Line 2 of answer</mgo-a>
</mgo-card>
<mgo-card cardId="legacy-02">
Question 2
<mgo-a>Answer 2</mgo-a>
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards[0].back).toBe('Answer 1\nLine 2 of answer');
            expect(cards[0].front).not.toContain('Question 2');
            expect(cards[1].back).toBe('Answer 2');
        });
    });

    describe('Inline cards (single-line mgo-card)', () => {
        it('parses a simple inline basic card', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="sl-1">What is the capital of France?<mgo-a>Paris</mgo-a></mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('basic');
            expect(cards[0].front).toBe('What is the capital of France?');
            expect(cards[0].back).toBe('Paris');
        });

        it('parses a reversed card (reverse attribute)', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="rev-1" reverse>Capital of France<mgo-a>Paris</mgo-a></mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('reversed');
            expect(cards[0].front).toBe('Paris');
            expect(cards[0].back).toBe('Capital of France');
        });

        it('parses multiple inline cards in one note', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="m1">Q1<mgo-a>A1</mgo-a></mgo-card>
<mgo-card cardId="m2">Q2<mgo-a>A2</mgo-a></mgo-card>
<mgo-card cardId="m3" reverse>Q3<mgo-a>A3</mgo-a></mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            expect(dm.getAllCards()).toHaveLength(3);
        });

        it('does not confuse colons in text for cards', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="colon-1">This is not::A card<mgo-a>The real answer</mgo-a></mgo-card>

Time:: 12:30 is just plain prose outside a card.
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].front).toBe('This is not::A card');
            expect(cards[0].back).toBe('The real answer');
        });

        it('parses cardId into a stable deckId::cardId format', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="fsrs-abc123">Capital of France<mgo-a>Paris</mgo-a></mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            // cardId should produce a stable ID with hash::cardId format
            expect(cards[0].id).toMatch(/^[a-f0-9]+::fsrs-abc123$/);
            expect(cards[0].front).toBe('Capital of France');
            expect(cards[0].back).toBe('Paris');
        });

        it('parses a typein card', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="ti-1" type="typein">Type the capital of France<mgo-a>Paris</mgo-a></mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('typein');
            expect(cards[0].front).toBe('Type the capital of France');
            expect(cards[0].back).toBe('Paris');
        });
    });

    describe('Cloze deletion cards', () => {
        it('parses a simple cloze card', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="cloze-1">
The ==c1::mitochondria== is the powerhouse of the cell.
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(1);
            expect(cards[0].type).toBe('cloze');
            expect(cards[0].front).toContain('[...]');
            expect(cards[0].back).toContain('mitochondria');
            expect(cards[0].back).not.toContain('==c1::');
        });

        it('creates separate cards for each cloze number', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="mito">
The ==c1::mitochondria== is the powerhouse of the ==c2::cell==.
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards.every(c => c.type === 'cloze')).toBe(true);
            expect(cards.every(c => /::mito-\d$/.test(c.id))).toBe(true);

            // c1 card should hide mitochondria and show cell as plain text (no raw ==c2:: marker)
            const c1Card = cards.find(c => c.front.includes('[...]') && c.front.includes('cell'));
            expect(c1Card).toBeDefined();
            expect(c1Card!.front).toBe('The [...] is the powerhouse of the cell.');
            expect(c1Card!.front).not.toContain('==c2::');

            // c2 card should hide cell and show mitochondria as plain text (no raw ==c1:: marker)
            const c2Card = cards.find(c => c.front.includes('[...]') && c.front.includes('mitochondria'));
            expect(c2Card).toBeDefined();
            expect(c2Card!.front).toBe('The mitochondria is the powerhouse of the [...].');
            expect(c2Card!.front).not.toContain('==c1::');
        });

        it('supports optional hints and shared cloze numbers', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="oz">==c1::Canberra::capital== is in ==c2::Australia==, and ==c1::Wellington::capital== is in ==c2::New Zealand==.</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            // Should create 2 cards total (c1 and c2), not 4
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

        it('does not leak content between an adjacent basic card and a cloze card with no blank line', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

<mgo-card cardId="fsrs-b1">
What are basic types?
<mgo-a>| Type | Description |
| \`int\` | Integer |</mgo-a>
</mgo-card>
<mgo-card cardId="fsrs-c1">Use the ==c1::type()== function to check type.</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);

            const basicCard = cards.find(c => c.type === 'basic')!;
            expect(basicCard.front).toBe('What are basic types?');
            expect(basicCard.back).toBe('| Type | Description |\n| `int` | Integer |');
            expect(basicCard.back).not.toContain('mgo-card');

            const clozeCard = cards.find(c => c.type === 'cloze')!;
            expect(clozeCard.front).toBe('Use the [...] function to check type.');
            expect(clozeCard.back).toBe('Use the type() function to check type.');
            expect(clozeCard.id).toMatch(/::fsrs-c1-1$/);
            expect(clozeCard.front).not.toContain('What are basic types');
        });

        it('ignores cloze syntax that is not wrapped in an mgo-card block', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
---

Answer with ==c1::inline notation== written as plain prose.
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(0);
        });

        it('parses real-world mixed deck with code blocks, tables, and clozes without leakage', async () => {
            const fs = await import('fs');
            const realPath = '/home/sapiens/Second Brain/Flashcards/associate data scientist/01 - introduction to python.md';
            if (!fs.existsSync(realPath)) return;
            const content = fs.readFileSync(realPath, 'utf8');

            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(content);
            await dm.updateFile({ path: realPath, basename: '01 - introduction to python' } as never);

            const cards = dm.getAllCards();
            expect(cards).toHaveLength(26);

            for (const card of cards) {
                expect(card.front).not.toMatch(/---\s*(?:end|card-end|card)\s*---/i);
                expect(card.back).not.toMatch(/---\s*(?:end|card-end|card)\s*---/i);
            }

            const expCloze = cards.find(c => c.id.includes('fsrs-py1j2k3l4-1'));
            expect(expCloze).toBeDefined();
            expect(expCloze!.front).toBe('The [...] operator is used for exponentiation in Python (e.g., `height ** 2`). ^fsrs-py1j2k3l4');

            const typeCloze = cards.find(c => c.id.includes('fsrs-py9p0q1r2-1'));
            expect(typeCloze).toBeDefined();
            expect(typeCloze!.front).toBe("Use the [...] function to check a variable's type (e.g., `type(bmi)` returns `<class 'float'>`). ^fsrs-py9p0q1r2");

            // Python comments like "# Removing elements" inside code blocks must not leak as card context
            const methodCard = cards.find(c => c.id.includes('fsrs-px3y4z5a6'));
            expect(methodCard).toBeDefined();
            expect(methodCard!.context).toBeUndefined();
        });

        it('ignores comments starting with # inside code blocks and frontmatter for heading breadcrumbs', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({
                tags: [{ tag: '#flashcards', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }],
            });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`---
tags: [flashcards]
# YAML comment
---

# Real Section

<mgo-card cardId="card-1">
Question 1
<mgo-a>
\`\`\`python
# Python comment inside code
print("hello")
\`\`\`
</mgo-a>
</mgo-card>

<mgo-card cardId="card-2">
Question 2
<mgo-a>Answer 2</mgo-a>
</mgo-card>
`);
            await dm.updateFile({ path: 'test-note.md', basename: 'test-note' } as never);
            const cards = dm.getAllCards();
            expect(cards).toHaveLength(2);
            expect(cards[0].context).toBe('Real Section');
            expect(cards[1].context).toBe('Real Section');
        });
    });

    describe('Deck detection', () => {
        it('ignores files without the deck tag', async () => {
            const plugin = createMockPlugin();
            const dm = new DataManager(plugin as never);
            plugin.app.metadataCache.getFileCache = vi.fn().mockReturnValue({ tags: [] });
            plugin.app.vault.read = vi.fn().mockResolvedValue(`<mgo-card cardId="q1">Front<mgo-a>Back</mgo-a></mgo-card>`);
            await dm.updateFile({ path: 'no-deck-tag.md', basename: 'no-deck-tag' } as never);
            expect(dm.getAllCards()).toHaveLength(0);
            expect(dm.getDecks()).toHaveLength(0);
        });
    });
});
