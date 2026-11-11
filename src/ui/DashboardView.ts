import { ItemView, WorkspaceLeaf, ButtonComponent, Notice, setIcon } from 'obsidian';
import { VIEW_TYPE_DASHBOARD, VIEW_ICON_NAME, getErrorMessage } from '../data/constants';
import type { Deck, DeckFolder } from '../data/types';
import { ReviewModal } from './ReviewModal';
import { StatsModal } from './StatsModal';
import { CustomStudyModal } from './CustomStudyModal';
import { HelpModal } from './HelpModal';
import { BrowseModal } from './BrowseModal';
import { CreateCardModal } from './CreateCardModal';
import { CreateDeckModal } from './CreateDeckModal';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class DashboardView extends ItemView {
    private plugin: FSRSFlashcardsPlugin;
    constructor(leaf: WorkspaceLeaf, plugin: FSRSFlashcardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }
    getViewType(): string { return VIEW_TYPE_DASHBOARD; }
    getDisplayText(): string { return 'Lemma decks'; }
    getIcon(): string { return VIEW_ICON_NAME; }
    async onOpen() {
        this.registerDomEvent(this.contentEl, 'scroll', () => {
            this.plugin.dataManager.setDashboardScrollTop(this.contentEl.scrollTop);
        });
        this.render();
    }

    render() {
        if (this.contentEl.childElementCount > 0) {
            this.plugin.dataManager.setDashboardScrollTop(this.contentEl.scrollTop);
        }
        this.contentEl.empty();
        this.renderSaveError();

        if (!this.plugin.dataManager.isDataLoaded()) {
            this.renderLoading();
            return;
        }

        this.renderHeader();
        this.renderDecks();
        this.contentEl.scrollTop = this.plugin.dataManager.getDashboardScrollTop();
    }

    private renderSaveError() {
        const error = this.plugin.dataManager.getSaveError();
        if (!error) return;
        const banner = this.contentEl.createDiv({ cls: 'fsrs-save-error', attr: { role: 'alert' } });
        banner.createSpan({ text: `Progress could not be saved: ${error}` });
        const retry = new ButtonComponent(banner).setButtonText('Retry save').onClick(async () => {
            retry.setDisabled(true);
            try {
                await this.plugin.dataManager.retrySave();
                this.render();
            } catch (error: unknown) {
                new Notice(`Could not save progress: ${getErrorMessage(error)}`, 7000);
            } finally {
                retry.setDisabled(false);
            }
        });
    }

    private renderLoading() {
        const container = this.contentEl.createDiv({ cls: 'fsrs-empty-state' });
        container.createEl('h2', { text: 'Loading decks...' });
        container.createEl('p', { text: 'Please wait while we scan your vault.' });
        new ButtonComponent(container)
            .setIcon('loader')
            .setDisabled(true)
            .buttonEl.addClass('loading-spinner');
    }

    private renderHeader() {
        const headerEl = this.contentEl.createDiv({ cls: 'fsrs-dashboard-header' });

        const headerTop = headerEl.createDiv({ cls: 'fsrs-header-top' });

        const titleSection = headerTop.createDiv({ cls: 'fsrs-title-section' });
        const logoIcon = titleSection.createDiv({ cls: 'fsrs-logo-icon' });
        setIcon(logoIcon, VIEW_ICON_NAME);
        titleSection.createEl('h2', { text: 'Lemma', cls: 'fsrs-title' });

        const actionsRow = headerEl.createDiv({ cls: 'fsrs-quick-actions' });

        const createDashBtn = (icon: string, text: string, onClick: () => void, isPrimary = false) => {
            const btn = new ButtonComponent(actionsRow)
                .setIcon(icon)
                .onClick(onClick);
            btn.buttonEl.createSpan({ text });
            if (isPrimary) btn.setCta();
            return btn;
        };

        const studyAllBtn = createDashBtn('play', 'Study all', () => {
            const allDueCards = this.plugin.dataManager.getDecks()
                .flatMap((d: Deck) => this.plugin.dataManager.getReviewQueue(d.id));
            if (allDueCards.length === 0) {
                const limited = this.plugin.dataManager.getDecks().some((d: Deck) => d.stats.new > 0 || d.stats.due > 0);
                new Notice(limited
                    ? 'Daily limits reached. Use cram on a deck to keep studying.'
                    : 'No cards due for review!');
                return;
            }
            new ReviewModal(this.app, this.plugin, allDueCards).open();
        }, true);
        const availableCount = this.plugin.dataManager.getDecks()
            .reduce((sum, deck) => sum + this.plugin.dataManager.getReviewQueue(deck.id).length, 0);
        studyAllBtn.buttonEl.createSpan({ text: availableCount.toString(), cls: 'fsrs-action-badge' });
        studyAllBtn.buttonEl.setAttribute('aria-label', `Study all: ${availableCount} cards available within daily limits`);

        createDashBtn('folder-plus', 'New deck', () => new CreateDeckModal(this.app, this.plugin).open());
        createDashBtn('plus', 'New card', () => new CreateCardModal(this.app, this.plugin).open());
        createDashBtn('bar-chart-2', 'Statistics', () => new StatsModal(this.app, this.plugin).open());
        createDashBtn('filter', 'Custom study', () => new CustomStudyModal(this.app, this.plugin).open());

        const iconRow = actionsRow.createDiv({ cls: 'fsrs-icon-row' });

        const helpBtn = iconRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Help & guide' } });
        setIcon(helpBtn, 'help-circle');
        helpBtn.addEventListener('click', () => new HelpModal(this.app, this.plugin).open());

        const refreshBtn = iconRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Refresh' } });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => {
            void (async () => {
                refreshBtn.addClass('is-spinning');
                try {
                    await this.plugin.dataManager.buildIndex();
                    this.render();
                } finally {
                    refreshBtn.removeClass('is-spinning');
                }
            })();
        });

        const pouchDB = this.plugin.dataManager.getPouchDB();
        if (this.plugin.settings.syncEnabled && pouchDB) {
            const syncBtn = iconRow.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Sync' } });
            setIcon(syncBtn, 'cloud');
            syncBtn.addEventListener('click', () => {
                void (async () => {
                    if (pouchDB.isSyncing()) {
                        new Notice('Sync in progress...');
                        return;
                    }
                    syncBtn.addClass('is-busy');
                    try {
                        const syncTimeout = new Promise<never>((_, reject) => {
                            window.setTimeout(() => reject(new Error('Sync request timed out')), 15000);
                        });
                        await Promise.race([pouchDB.manualSync(), syncTimeout]);
                        new Notice('Sync completed!', 3000);
                    } catch (error: unknown) {
                        new Notice(`Sync failed: ${getErrorMessage(error)}`, 5000);
                    } finally {
                        syncBtn.removeClass('is-busy');
                        syncBtn.removeAttribute('disabled');
                    }
                })();
            });
        }

        const decks = this.plugin.dataManager.getDecks();
        const globalStats = decks.reduce((acc: { new: number; due: number; total: number }, deck: Deck) => {
            acc.new += deck.stats.new;
            acc.due += deck.stats.due;
            acc.total += deck.cardIds.size;
            return acc;
        }, { new: 0, due: 0, total: 0 });

        const statsEl = headerEl.createDiv({ cls: 'fsrs-stats-cards' });

        const createStatPill = (icon: string, value: string, label: string, variant: string) => {
            const pill = statsEl.createDiv({ cls: `fsrs-stat-pill fsrs-stat-pill-${variant}` });
            const iconEl = pill.createDiv();
            setIcon(iconEl, icon);
            pill.createSpan({ text: value, cls: 'fsrs-stat-pill-value' });
            pill.createSpan({ text: label });
        };

        createStatPill('layers', globalStats.total.toString(), 'total', 'neutral');
        createStatPill('clock', globalStats.due.toString(), 'due', 'due');
        createStatPill('sparkles', globalStats.new.toString(), 'new', 'new');
        createStatPill('play', availableCount.toString(), 'available today', 'neutral');

        // Gamification widget
        const gamification = this.plugin.dataManager.getGamificationStats();
        const gamificationEl = headerEl.createDiv({ cls: 'fsrs-gamification' });

        const streakEl = gamificationEl.createDiv({ cls: 'fsrs-gamification-item' });
        setIcon(streakEl.createSpan({ cls: 'fsrs-gamification-icon' }), 'flame');
        const streakValue = streakEl.createSpan({ cls: 'fsrs-gamification-value' });
        streakValue.setText(gamification.currentStreak.toString());
        streakEl.createSpan({ cls: 'fsrs-gamification-label', text: 'day streak' });

        const xpEl = gamificationEl.createDiv({ cls: 'fsrs-gamification-item' });
        setIcon(xpEl.createSpan({ cls: 'fsrs-gamification-icon' }), 'star');
        xpEl.createSpan({ cls: 'fsrs-gamification-value', text: gamification.totalXp.toString() });
        xpEl.createSpan({ cls: 'fsrs-gamification-label', text: 'XP' });

        const bestEl = gamificationEl.createDiv({ cls: 'fsrs-gamification-item' });
        setIcon(bestEl.createSpan({ cls: 'fsrs-gamification-icon' }), 'trophy');
        bestEl.createSpan({ cls: 'fsrs-gamification-value', text: gamification.longestStreak.toString() });
        bestEl.createSpan({ cls: 'fsrs-gamification-label', text: 'best streak' });
    }

    private renderDecks() {
        const decks = this.plugin.dataManager.getDecks();
        if (decks.length === 0) { this.renderEmptyState(); return; }

        for (const folder of this.plugin.dataManager.getDeckFolders()) {
            this.renderFolderGroup(this.contentEl, folder);
        }
    }

    private renderFolderGroup(container: HTMLElement, folder: DeckFolder) {
        const folderContainer = container.createDiv({ cls: 'fsrs-folder-group' });
        folderContainer.setAttribute('data-folder-path', folder.path);
        const isExpanded = this.plugin.dataManager.isDashboardFolderExpanded(folder.path);

        const heading = folderContainer.createDiv({ cls: 'fsrs-folder-heading' });
        const folderHeader = heading.createDiv({ cls: 'fsrs-folder-header' });
        folderHeader.setAttribute('role', 'button');
        folderHeader.setAttribute('tabindex', '0');
        folderHeader.setAttribute('aria-expanded', isExpanded.toString());

        const chevronIcon = folderHeader.createDiv({ cls: 'fsrs-folder-chevron' });
        setIcon(chevronIcon, isExpanded ? 'chevron-down' : 'chevron-right');

        const folderIcon = folderHeader.createDiv({ cls: 'fsrs-folder-icon' });
        setIcon(folderIcon, isExpanded ? 'folder-open' : 'folder-closed');

        folderHeader.createSpan({ text: folder.name, cls: 'fsrs-folder-name' });

        const dueCardsInFolder = folder.dueCount;

        const countContainer = folderHeader.createDiv({ cls: 'fsrs-folder-count-container' });

        if (dueCardsInFolder > 0) {
            countContainer.createSpan({
                text: `${dueCardsInFolder}`,
                cls: 'fsrs-folder-count fsrs-folder-due-count',
            });
        }
        countContainer.createSpan({
            text: `${folder.deckCount}`,
            cls: 'fsrs-folder-count',
        });

        const available = this.plugin.dataManager.getFolderReviewQueue(folder.path).length;
        const studyFolder = heading.createEl('button', {
            cls: 'clickable-icon fsrs-folder-study',
            attr: { 'aria-label': `Study folder ${folder.name}: ${available} cards available within daily limits` },
        });
        setIcon(studyFolder, 'play');
        studyFolder.createSpan({ text: available.toString(), cls: 'fsrs-folder-available' });
        studyFolder.addEventListener('click', () => {
            const queue = this.plugin.dataManager.getFolderReviewQueue(folder.path);
            if (queue.length === 0) {
                new Notice('No cards available in this folder within daily limits. Use cram on a deck to keep studying.');
                return;
            }
            new ReviewModal(this.app, this.plugin, queue, folder.name).open();
        });

        const decksContainer = folderContainer.createDiv({ cls: 'fsrs-folder-decks' });
        if (!isExpanded) decksContainer.hide();
        folderHeader.toggleClass('is-collapsed', !isExpanded);
        folderHeader.toggleClass('is-expanded', isExpanded);

        const toggleFolder = () => {
            const isCollapsed = this.plugin.dataManager.isDashboardFolderExpanded(folder.path);
            void this.plugin.dataManager.setDashboardFolderExpanded(folder.path, !isCollapsed).catch((error: unknown) => {
                new Notice(`Could not save folder state: ${getErrorMessage(error)}`);
            });
            folderHeader.toggleClass('is-collapsed', isCollapsed);
            folderHeader.toggleClass('is-expanded', !isCollapsed);
            folderHeader.setAttribute('aria-expanded', (!isCollapsed).toString());
            if (isCollapsed) { decksContainer.hide(); } else { decksContainer.show(); }
            setIcon(chevronIcon, isCollapsed ? 'chevron-right' : 'chevron-down');
            setIcon(folderIcon, isCollapsed ? 'folder-closed' : 'folder-open');
        };

        folderHeader.addEventListener('click', toggleFolder);
        folderHeader.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleFolder();
            }
        });

        for (const child of folder.folders) {
            this.renderFolderGroup(decksContainer, child);
        }
        for (const deck of folder.decks) {
            this.renderDeckItem(decksContainer, deck);
        }
    }

    private renderDeckItem(container: HTMLElement, deck: Deck) {
        const hasDue = deck.stats.due > 0;
        const available = this.plugin.dataManager.getReviewQueue(deck.id).length;

        const deckRow = container.createDiv({ cls: 'fsrs-deck-row' });

        const openDeck = () => {
            this.plugin.dataManager.setDashboardScrollTop(this.contentEl.scrollTop);
            void this.app.workspace.openLinkText(deck.filePath, deck.filePath);
        };
        deckRow.addEventListener('click', openDeck);

        const iconEl = deckRow.createDiv({ cls: 'fsrs-deck-row-icon' });
        setIcon(iconEl, hasDue ? 'file-clock' : 'file-text');
        if (hasDue) {
            iconEl.addClass('has-due');
        }

        const deckLink = deckRow.createEl('a', {
            text: deck.title, cls: 'fsrs-deck-row-title', attr: { href: deck.filePath },
        });
        deckLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openDeck();
        });
        deckLink.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                openDeck();
            }
        });

        const statsEl = deckRow.createDiv({ cls: 'fsrs-deck-row-stats' });
        statsEl.createSpan({ text: `${available} available`, cls: 'fsrs-stat-available' });
        if (deck.stats.due > 0) {
            statsEl.createSpan({
                text: `${deck.stats.due}`,
                cls: 'fsrs-stat-due has-due',
            });
        }
        if (deck.stats.new > 0) {
            statsEl.createSpan({ text: `${deck.stats.new}`, cls: 'fsrs-stat-new' });
        }

        const actionsEl = deckRow.createDiv({ cls: 'fsrs-deck-row-actions' });

        const studyBtn = actionsEl.createEl('button', {
            cls: `clickable-icon${available > 0 ? '' : ' fsrs-deck-muted'}`,
            attr: { 'aria-label': available > 0 ? `Study ${available} available cards` : 'No cards available within daily limits' },
        });
        setIcon(studyBtn, 'play');
        studyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const queue = this.plugin.dataManager.getReviewQueue(deck.id);
            if (queue.length === 0) {
                new Notice(deck.stats.new > 0 || deck.stats.due > 0
                    ? 'Daily limit reached for this deck. Use cram to keep studying.'
                    : 'No cards to review in this deck!');
                return;
            }
            new ReviewModal(this.app, this.plugin, queue, deck.title).open();
        });

        const cramBtn = actionsEl.createEl('button', {
            cls: 'clickable-icon',
            attr: { 'aria-label': 'Cram all cards' },
        });
        setIcon(cramBtn, 'zap');
        cramBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cards = this.plugin.dataManager.getAllCardsForStudy(deck.id);
            if (cards.length === 0) {
                new Notice('No cards in this deck!');
                return;
            }
            new ReviewModal(this.app, this.plugin, cards, deck.title).open();
        });

        const browseBtn = actionsEl.createEl('button', {
            cls: 'clickable-icon',
            attr: { 'aria-label': 'Browse cards' },
        });
        setIcon(browseBtn, 'list');
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cards = this.plugin.dataManager.getCardsByDeck(deck.id);
            if (cards.length === 0) {
                new Notice('This deck has no cards to browse.');
                return;
            }
            new BrowseModal(this.app, this.plugin, cards, deck.title).open();
        });
    }

    private renderEmptyState() {
        const emptyStateEl = this.contentEl.createDiv({ cls: 'fsrs-empty-state' });

        const iconContainer = emptyStateEl.createDiv({ cls: 'fsrs-empty-icon-container' });
        const iconEl = iconContainer.createDiv({ cls: 'fsrs-empty-icon' });
        setIcon(iconEl, 'sparkles');

        emptyStateEl.createEl('h3', { text: 'Ready to learn?', cls: 'fsrs-empty-title' });

        emptyStateEl.createEl('p', {
            text: `Create flashcards by adding the tag #${this.plugin.settings.deckTag} to any note, or start directly below.`,
            cls: 'fsrs-empty-desc',
        });

        const emptyActions = emptyStateEl.createDiv({ cls: 'fsrs-empty-actions' });
        new ButtonComponent(emptyActions)
            .setIcon('folder-plus')
            .setButtonText('Create new deck')
            .setCta()
            .onClick(() => new CreateDeckModal(this.app, this.plugin).open());

        new ButtonComponent(emptyActions)
            .setIcon('plus')
            .setButtonText('Create flashcard')
            .onClick(() => new CreateCardModal(this.app, this.plugin).open());

        const tipEl = emptyStateEl.createDiv({ cls: 'fsrs-empty-tip' });
        const tipIcon = tipEl.createDiv({ cls: 'fsrs-tip-icon' });
        setIcon(tipIcon, 'lightbulb');
        tipEl.createSpan({ text: 'Pro tip: Use ---card--- or Q::A in any tagged note to add cards instantly.' });
    }
}
