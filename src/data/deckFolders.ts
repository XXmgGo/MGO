import type { Deck, DeckFolder } from './types';

export function buildDeckFolders(decks: Deck[]): DeckFolder[] {
    const folders = new Map<string, DeckFolder>();
    const roots: DeckFolder[] = [];

    const getFolder = (path: string): DeckFolder => {
        const existing = folders.get(path);
        if (existing) return existing;
        const slash = path.lastIndexOf('/');
        const folder: DeckFolder = {
            path,
            name: path ? path.slice(slash + 1) : 'Root',
            folders: [], decks: [], deckCount: 0, dueCount: 0,
        };
        folders.set(path, folder);
        if (slash < 0) roots.push(folder);
        else getFolder(path.slice(0, slash)).folders.push(folder);
        return folder;
    };

    for (const deck of decks) {
        const slash = deck.filePath.lastIndexOf('/');
        const path = slash < 0 ? '' : deck.filePath.slice(0, slash);
        getFolder(path).decks.push(deck);
    }

    const summarize = (siblings: DeckFolder[]) => {
        siblings.sort((a, b) => a.name.localeCompare(b.name));
        for (const folder of siblings) {
            summarize(folder.folders);
            folder.decks.sort((a, b) => a.title.localeCompare(b.title));
            folder.deckCount = folder.decks.length + folder.folders.reduce((sum, child) => sum + child.deckCount, 0);
            folder.dueCount = folder.decks.reduce((sum, deck) => sum + deck.stats.due, 0)
                + folder.folders.reduce((sum, child) => sum + child.dueCount, 0);
        }
    };
    summarize(roots);
    return roots;
}
