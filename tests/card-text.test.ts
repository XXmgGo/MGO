import { describe, it, expect } from 'vitest';
import { splitMgoCardSections, parseCardDisplay, revealCloze, extractCardBody } from '../src/data/cardText';

describe('cardText helpers (reading-view post processor)', () => {
    const note = 'Some prose.\n\n<mgo-card cardId="x1">\n<mgo-card-front>\nQuestion line one\nQuestion line two\n</mgo-card-front>\n<mgo-card-back>\nAnswer\n</mgo-card-back>\n</mgo-card>\n\nTrailing text.\n';

    it('splits text and card sections in order', () => {
        const parts = splitMgoCardSections(note);
        expect(parts.map(p => p.type)).toEqual(['text', 'card', 'text']);
        expect(parts[0].value).toContain('Some prose.');
        expect(parts[2].value).toContain('Trailing text.');
    });

    it('parses front and back from child tags, keeping inner newlines', () => {
        const card = splitMgoCardSections(note).find(p => p.type === 'card')!.value;
        const { front, back } = parseCardDisplay(extractCardBody(card));
        expect(front).toBe('Question line one\nQuestion line two');
        expect(back).toBe('Answer');
    });

    it('treats the whole body as front when no child tags exist', () => {
        const r = parseCardDisplay('Just a question, no answer tag');
        expect(r.front).toBe('Just a question, no answer tag');
        expect(r.back).toBe('');
    });

    it('uses body-minus-back as front when only the back tag exists', () => {
        const r = parseCardDisplay('Lead in\n<mgo-card-back>Answer</mgo-card-back>');
        expect(r.front).toBe('Lead in');
        expect(r.back).toBe('Answer');
    });

    it('reveals cloze bodies for Obsidian highlight rendering', () => {
        expect(revealCloze('The ==c1::mitochondria== is the powerhouse.'))
            .toBe('The ==mitochondria== is the powerhouse.');
        expect(revealCloze('Give ==c2::answer::hint== please'))
            .toBe('Give ==hint== please');
    });

    it('handles multiple cards in one section', () => {
        const src = '<mgo-card cardId="a"><mgo-card-front>A</mgo-card-front></mgo-card> middle <mgo-card cardId="b"><mgo-card-back>B</mgo-card-back></mgo-card>';
        const parts = splitMgoCardSections(src);
        expect(parts.filter(p => p.type === 'card')).toHaveLength(2);
    });

    it('returns text-only input unchanged as a single text section', () => {
        const parts = splitMgoCardSections('# Heading\nplain paragraph');
        expect(parts).toEqual([{ type: 'text', value: '# Heading\nplain paragraph' }]);
    });
});
