vi.mock('obsidian', () => {
    class MockNotice {
        constructor(public message: string, public duration?: number) {}
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
        Component: class { unload() {} },
        Plugin: class {},
        setIcon: () => {},
        debounce: (fn: any) => fn,
    };
});

vi.mock('../src/database/PouchDBManager', () => {
    class MockPouchDBManager {
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
import { Rating } from 'ts-fsrs';
import { CARD_BLOCK_RE, clozeBack, clozeFront, clozeNumbers, hasCloze, parseCardBlockAttributes, parseCardBlockBody, resolveQuizAnswer, resolveQuizKind, revealCloze, splitQuizBack } from '../src/data/cardText';
import { DataManager } from '../src/data/DataManager';
import { DEFAULT_SETTINGS } from '../src/data/constants';

const fence = (lang: string, body: string) => '```' + lang + '\n' + body + '\n```\n';

describe('code fence card syntax (pure helpers)', () => {
    it('splits front and back on a standalone --- line', () => {
        expect(parseCardBlockBody('问题第一行\n问题第二行\n---\n答案第一行\n答案第二行'))
            .toEqual({ front: '问题第一行\n问题第二行', back: '答案第一行\n答案第二行' });
    });

    it('treats the whole body as the front when the separator is missing', () => {
        expect(parseCardBlockBody('只有问题')).toEqual({ front: '只有问题', back: '' });
    });

    it('ignores --- lines with surrounding spaces but not --- inside text', () => {
        expect(parseCardBlockBody('Q\n   ---   \nA')).toEqual({ front: 'Q', back: 'A' });
        expect(parseCardBlockBody('Q with --- inside\n---\nA')).toEqual({ front: 'Q with --- inside', back: 'A' });
    });

    it('detects and numbers cloze deletions', () => {
        expect(hasCloze('the ==c1::sky== is blue')).toBe(true);
        expect(clozeNumbers('==c2::a== and ==c1::b== and ==c2::c==')).toEqual(['2', '1']);
        expect(clozeFront('the ==c1::sky== is ==c2::blue==', '1')).toBe('the [...] is blue');
        expect(clozeFront('the ==c1::sky::天空== is ==c2::blue==', '1')).toBe('the [天空] is blue');
        expect(clozeBack('the ==c1::sky== is ==c2::blue==')).toBe('the sky is blue');
    });

    it('reveals cloze bodies for note rendering', () => {
        expect(revealCloze('The ==c1::mitochondria== is the powerhouse.'))
            .toBe('The ==mitochondria== is the powerhouse.');
        expect(revealCloze('Give ==c2::answer::hint== please'))
            .toBe('Give ==hint== please');
        expect(revealCloze('Plain ==highlight== stays put')).toBe('Plain ==highlight== stays put');
    });

    it('regex only matches mgo fences', () => {
        const text = fence('mgo', 'Q\n---\nA') + fence('js', 'const a = 1') + fence('mgo-reverse', 'Q\n---\nA');
        const langs = [...text.matchAll(CARD_BLOCK_RE)].map((m) => m[1]);
        expect(langs).toEqual(['mgo', 'mgo-reverse']);
    });

    it('parses an attribute header above the card content', () => {
        const body = '---\ntitle: 单词卡\nid: fsrs-word-1\noptions: [食べる, 飲む]\nhint: 动词\n---\n食べる\n---\n吃';
        const { attrs, content } = parseCardBlockAttributes(body);
        expect(attrs).toEqual({
            title: '单词卡',
            id: 'fsrs-word-1',
            options: ['食べる', '飲む'],
            hint: '动词',
        });
        expect(content.trim()).toBe('食べる\n---\n吃');
        expect(parseCardBlockBody(content)).toEqual({ front: '食べる', back: '吃' });
    });

    it('supports dash lists and comma-separated options', () => {
        const list = '---\noptions:\n  - A\n  - B\n  - C\n---\nq\n---\na';
        expect(parseCardBlockAttributes(list).attrs.options).toEqual(['A', 'B', 'C']);
        const csv = '---\noptions: A, B, C\n---\nq\n---\na';
        expect(parseCardBlockAttributes(csv).attrs.options).toEqual(['A', 'B', 'C']);
    });

    it('resolves an explicit type before inferring from the data', () => {
        const options = ['増え', '増える'];
        expect(resolveQuizKind(undefined, options, '2')).toBe('choice');
        expect(resolveQuizKind('single-choice', options, '2')).toBe('choice');
        expect(resolveQuizKind('choice', options, '2')).toBe('choice');
        expect(resolveQuizKind('QUIZ', options, 'B')).toBe('choice');
        expect(resolveQuizKind('input', undefined, '増える')).toBe('input');
        expect(resolveQuizKind('blank', undefined, '増える')).toBe('input');
        expect(resolveQuizKind(undefined, undefined, '増える')).toBe('input');
        expect(resolveQuizKind('basic', options, '2')).toBeNull();
        expect(resolveQuizKind('single-choice', options, '9')).toBeNull();
        expect(resolveQuizKind('input', undefined, undefined)).toBeNull();
    });

    it('resolves a quiz answer from an index, a letter or the option text', () => {
        const options = ['増え', '増える', '増やす', '増やし'];
        expect(resolveQuizAnswer('2', options)).toBe(1);
        expect(resolveQuizAnswer('B', options)).toBe(1);
        expect(resolveQuizAnswer('ｂ', options)).toBe(1);
        expect(resolveQuizAnswer('増やす', options)).toBe(2);
        expect(resolveQuizAnswer('9', options)).toBeNull();
        expect(resolveQuizAnswer('D', options)).toBe(3);
        expect(resolveQuizAnswer('', options)).toBeNull();
        expect(resolveQuizAnswer(undefined, options)).toBeNull();
        expect(resolveQuizAnswer('1', ['only one'])).toBeNull();
    });

    it('keeps the body untouched when there is no attribute header', () => {
        const body = 'Q with: a colon\n---\nA';
        const { attrs, content } = parseCardBlockAttributes(body);
        expect(attrs).toEqual({});
        expect(content).toBe(body);
    });

    it('rejects non-attribute lines inside a leading --- pair', () => {
        const body = '---\nnot an attribute line\n---\nq\n---\na';
        expect(parseCardBlockAttributes(body)).toEqual({ attrs: {}, content: body });
    });

    it('drops invalid ids but keeps other attributes', () => {
        const body = '---\ntitle: X\nid: has space\n---\nq\n---\na';
        const { attrs } = parseCardBlockAttributes(body);
        expect(attrs.title).toBe('X');
        expect(attrs.id).toBeUndefined();
    });

    it('strips the header before cloze detection', () => {
        const body = '---\ntitle: 线粒体\n---\nThe ==c1::mitochondria== is the powerhouse.';
        const { content } = parseCardBlockAttributes(body);
        expect(hasCloze(content)).toBe(true);
        expect(clozeNumbers(content)).toEqual(['1']);
    });

    it('keeps the audio url verbatim in the attribute header', () => {
        const body = '---\naudio: https://cdn.example.com/友だち-朗读.mp3\n---\nq\n---\na';
        expect(parseCardBlockAttributes(body).attrs.audio).toBe('https://cdn.example.com/友だち-朗读.mp3');
    });
});

function createPlugin(markdown: string, path = 'Deck.md') {
    const file = { path, basename: path.replace(/\.md$/, ''), stat: { mtime: 1 } };
    return {
        app: {
            vault: { getMarkdownFiles: () => [file], read: async () => markdown, on: () => () => {} },
            metadataCache: { getFileCache: () => ({ frontmatter: { tags: ['flashcards'] } }), getCache: () => null },
            workspace: { getLeavesOfType: () => [] },
        },
        settings: { ...DEFAULT_SETTINGS, usePouchDB: false },
        loadData: async () => null,
        saveData: async () => undefined,
        saveSettings: async () => undefined,
        refreshDashboardView: () => {},
    };
}

describe('DataManager parses code fence cards', () => {
    it('registers a multi-line basic card and keeps line breaks', async () => {
        const md = '# 牌组\n\n' + fence('mgo', '私は3年も国へ帰っていないので、\n早く家族に会いたくてたまらない。\n---\n我已经3年没有回家了，\n非常想早点见到家人。');
        const dm = new DataManager(createPlugin(md) as never);
        await dm.buildIndex();
        const cards = dm.getAllCards();
        expect(cards).toHaveLength(1);
        expect(cards[0].type).toBe('basic');
        expect(cards[0].front).toBe('私は3年も国へ帰っていないので、\n早く家族に会いたくてたまらない。');
        expect(cards[0].back).toBe('我已经3年没有回家了，\n非常想早点见到家人。');
    });

    it('supports mgo-reverse and mgo-typein fences', async () => {
        const md = '# 牌组\n\n' + fence('mgo-reverse', 'cat\n---\n猫') + '\n' + fence('mgo-typein', 'capital of France?\n---\nParis');
        const dm = new DataManager(createPlugin(md) as never);
        await dm.buildIndex();
        const cards = dm.getAllCards();
        expect(cards).toHaveLength(2);
        const reversed = cards.find((c) => c.type === 'reversed')!;
        expect(reversed.front).toBe('猫');
        expect(reversed.back).toBe('cat');
        expect(cards.find((c) => c.type === 'typein')!.front).toBe('capital of France?');
    });

    it('expands cloze fences into one card per number', async () => {
        const md = '# 牌组\n\n' + fence('mgo', 'The ==c1::mitochondria== makes ==c2::ATP==.');
        const dm = new DataManager(createPlugin(md) as never);
        await dm.buildIndex();
        const cards = dm.getAllCards();
        expect(cards).toHaveLength(2);
        expect(cards.every((c) => c.type === 'cloze')).toBe(true);
        expect(cards.map((c) => c.front).sort()).toEqual([
            'The [...] makes ATP.',
            'The mitochondria makes [...].',
        ]);
    });

    it('stores title, options, answer and hint, and keeps an explicit id stable', async () => {
        const block = (front: string) =>
            '```mgo\n---\ntitle: 单词卡\nid: fsrs-word-1\ntype: single-choice\noptions: [食べる, 飲む]\nanswer: 1\nhint: 动词\n---\n' + front + '\n---\n吃\n```';
        const first = new DataManager(createPlugin('# 牌组\n\n' + block('食べる')) as never);
        await first.buildIndex();
        const card = first.getAllCards()[0];
        expect(card.title).toBe('单词卡');
        expect(card.options).toEqual(['食べる', '飲む']);
        expect(card.answer).toBe('1');
        expect(card.kind).toBe('choice');
        expect(card.hint).toBe('动词');
        expect(card.id).toMatch(/::fsrs-word-1$/);

        const second = new DataManager(createPlugin('# 牌组\n\n' + block('飲む')) as never);
        await second.buildIndex();
        expect(second.getAllCards()[0].id).toBe(card.id);
    });

    it('stores the audio attribute on the card', async () => {
        const md = '# 牌组\n\n```mgo\n---\ntitle: 发音\naudio: https://cdn.example.com/a.mp3\n---\n食べる\n---\n吃\n```';
        const dm = new DataManager(createPlugin(md) as never);
        await dm.buildIndex();
        expect(dm.getAllCards()[0].audio).toBe('https://cdn.example.com/a.mp3');
    });

    it('recalculates deck stats right after a rating', async () => {
        const md = '# 牌组\n\n```mgo\n正面\n---\n背面\n```';
        const dm = new DataManager(createPlugin(md) as never);
        await dm.buildIndex();
        expect(dm.getDecks()[0].stats.new).toBe(1);

        dm.updateCard(dm.getAllCards()[0], Rating.Good);

        const stats = dm.getDecks()[0].stats;
        expect(stats.new).toBe(0);
        expect(stats.due).toBe(0);
        expect(stats.learning).toBe(1);
    });

    it('uses explicit ids for cloze cards too', async () => {
        const md = '# 牌组\n\n```mgo\n---\nid: fsrs-cl-1\n---\nThe ==c1::sky== is blue.\n```\n';
        const dm = new DataManager(createPlugin(md) as never);
        await dm.buildIndex();
        expect(dm.getAllCards()[0].id).toMatch(/::fsrs-cl-1-1$/);
    });
});
describe('splitQuizBack', () => {
    it('splits the answer line from the analysis', () => {
        const { answer, detail } = splitQuizBack('正解：② 増える\n句意：学生一直在增加。\n考察：「一方だ」接辞书形。');
        expect(answer).toBe('正解：② 増える');
        expect(detail).toContain('考察');
    });

    it('keeps a back without an answer line as detail', () => {
        const { answer, detail } = splitQuizBack('ただの背面');
        expect(answer).toBe('');
        expect(detail).toBe('ただの背面');
    });
});
