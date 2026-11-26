import { describe, it, expect } from 'vitest';
import { convertToMGO, parseDelimited } from '../src/data/importCards';

describe('card import', () => {
    it('converts a tab separated Anki plain text export to mgo fences', () => {
        const text = '#separator:tab\n#html:true\n#tags column:3\nCapital of France?\tParis\tgeo\nWhat is 2+2?<br>(easy)\t<b>4</b>&nbsp;units\tmath\n';
        const out = convertToMGO(text, 'flashcards');
        expect(out.cards).toBe(2);
        expect(out.markdown).toContain('MGO: flashcards');
        expect(out.markdown).toContain('```mgo\nCapital of France?\n---\nParis\n```');
        expect(out.markdown).toContain('```mgo\nWhat is 2+2?\n(easy)\n---\n4 units\n```');
    });

    it('converts Anki cloze notes and drops cloze hints', () => {
        const out = convertToMGO('The {{c1::mitochondria::organelle}} makes {{c2::ATP}}\n', 'flashcards');
        expect(out.markdown).toContain('```mgo\nThe ==c1::mitochondria== makes ==c2::ATP==\n```');
        expect(out.cards).toBe(1);
    });

    it('parses CSV with quotes, embedded commas, doubled quotes and newlines', () => {
        const csv = 'Front,Back\n"Say ""hi"", please","line one\nline two"\nplain,answer\n';
        expect(parseDelimited(csv, ',')).toEqual([
            ['Front', 'Back'],
            ['Say "hi", please', 'line one\nline two'],
            ['plain', 'answer'],
        ]);
        const out = convertToMGO(csv, 'flashcards');
        expect(out.cards).toBe(3);
        expect(out.markdown).toContain('```mgo\nFront\n---\nBack\n```');
        expect(out.markdown).toContain('```mgo\nSay "hi", please\n---\nline one\nline two\n```');
    });

    it('keeps text that would break inline syntax intact', () => {
        const out = convertToMGO('std::vector\tA C++ container\n', 'flashcards');
        expect(out.markdown).toContain('```mgo\nstd::vector\n---\nA C++ container\n```');
    });

    it('skips empty or incomplete rows and handles Windows line endings and a BOM', () => {
        const out = convertToMGO('\uFEFFa\tb\r\n\r\nonlyfront\t\r\nc\td\r\n', 'flashcards');
        expect(out.cards).toBe(2);
        expect(out.skipped).toBe(1);
        expect(out.markdown).toContain('```mgo\na\n---\nb\n```');
        expect(out.markdown).toContain('```mgo\nc\n---\nd\n```');
    });

    it('produces cards that the real parser reads back', async () => {
        const { vi } = await import('vitest');
        vi.doMock('obsidian', () => ({ Notice: class {}, TFile: class {} }));
        vi.doMock('../src/database/PouchDBManager', () => ({ PouchDBManager: class {} }));
        const { DataManager } = await import('../src/data/DataManager');
        const { DEFAULT_SETTINGS } = await import('../src/data/constants');
        const text = 'Q1\tA1\n"Q2 with\nbreak"\tA2\nThe {{c1::sky}} is blue\nstd::map\tdictionary\n';
        const out = convertToMGO(text, 'flashcards');
        expect(out.cards).toBe(4);
        const file = { path: 'Imported.md', basename: 'Imported', stat: { mtime: 1 } };
        const plugin = {
            app: { vault: { getMarkdownFiles: () => [file], read: async () => out.markdown }, metadataCache: { getFileCache: () => ({ frontmatter: { MGO: 'flashcards' } }) } },
            settings: { ...DEFAULT_SETTINGS, usePouchDB: false },
            loadData: async () => null, saveData: async () => undefined,
        };
        const dm = new DataManager(plugin as never);
        await dm.buildIndex();
        const cards = dm.getAllCards();
        expect(cards).toHaveLength(4);
        expect(cards.map((c) => c.type).sort()).toEqual(['basic', 'basic', 'basic', 'cloze']);
        expect(cards.find((c) => c.front.startsWith('Q2'))?.back).toBe('A2');
        expect(cards.find((c) => c.front.replace(/\u200B/g, '') === 'std::map')?.back).toBe('dictionary');
    });
});