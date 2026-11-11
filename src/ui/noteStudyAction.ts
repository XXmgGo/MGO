import { MarkdownView, Notice } from 'obsidian';
import { getErrorMessage } from '../data/constants';
import { ReviewModal } from './ReviewModal';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export function updateNoteStudyActions(plugin: FSRSFlashcardsPlugin): void {
    for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) continue;
        const eligible = plugin.dataManager.isDataLoaded() && view.file && plugin.dataManager.isFileDeck(view.file);
        let action = view.containerEl.querySelector<HTMLElement>('.fsrs-note-study-action');
        if (!eligible) {
            action?.hide();
            continue;
        }
        if (action) {
            action.show();
            continue;
        }
        let opening = false;
        action = view.addAction('play', 'Study flashcards in this note', () => {
            if (opening) return;
            const file = view.file;
            if (!file) return;
            opening = true;
            void (async () => {
                try {
                    if (view.getMode() === 'source') await view.save();
                    if (view.file !== file) return;
                    await plugin.dataManager.updateFile(file);
                    plugin.dataManager.recalculateAllDeckStats();
                    plugin.refreshDashboardView();
                    const deckId = plugin.dataManager.getDeckId(file.path);
                    const queue = plugin.dataManager.getReviewQueue(deckId);
                    if (queue.length === 0) {
                        new Notice(plugin.dataManager.getCardsByDeck(deckId).length > 0
                            ? 'No cards available in this note within daily limits. Use cram from the dashboard to keep studying.'
                            : 'No flashcards found in this note.');
                        return;
                    }
                    const title = plugin.dataManager.getDecks().find(deck => deck.id === deckId)?.title ?? file.basename;
                    new ReviewModal(plugin.app, plugin, queue, title).open();
                } catch (error: unknown) {
                    new Notice(`Could not study this note: ${getErrorMessage(error)}`, 7000);
                } finally {
                    opening = false;
                }
            })();
        });
        action.addClass('fsrs-note-study-action');
        action.setAttribute('role', 'button');
        action.setAttribute('tabindex', '0');
        action.setAttribute('aria-label', 'Study flashcards in this note');
        const actionEl = action;
        plugin.registerDomEvent(actionEl, 'keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                actionEl.click();
            }
        });
        plugin.register(() => actionEl.remove());
    }
}
