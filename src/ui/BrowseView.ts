import { Component, ItemView, MarkdownRenderer, WorkspaceLeaf, setIcon, type ViewStateResult } from 'obsidian';
import type { Card } from '../data/types';
import { VIEW_ICON_NAME, VIEW_TYPE_BROWSE, toHardBreaks } from '../data/constants';
import { openCardSource } from './cardSource';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

/** 卡片浏览：独立标签页，左右翻卡，可直接跳到原文笔记。 */
export class BrowseView extends ItemView {
    private plugin: FSRSFlashcardsPlugin;
    private cards: Card[] = [];
    private deckName: string | null = null;
    private index = 0;
    private started = false;
    private active = false;
    private renderComponent = new Component();

    private cardContainer!: HTMLElement;
    private contextEl!: HTMLElement;
    private frontEl!: HTMLElement;
    private backEl!: HTMLElement;
    private counterEl!: HTMLElement;
    private progressFill!: HTMLElement;
    private prevBtn!: HTMLButtonElement;
    private nextBtn!: HTMLButtonElement;

    constructor(leaf: WorkspaceLeaf, plugin: FSRSFlashcardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_BROWSE; }

    getDisplayText(): string { return this.deckName ?? '浏览'; }

    getIcon(): string { return VIEW_ICON_NAME; }

    async setState(state: unknown, _result: ViewStateResult): Promise<void> {
        const s = (state ?? {}) as { deckName?: string };
        if (typeof s.deckName === 'string') this.deckName = s.deckName;
    }

    async onOpen(): Promise<void> {
        this.containerEl.addClass('fsrs-browse-view');
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => this.handleKeyPress(evt));
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            this.active = leaf === this.leaf;
        }));
        if (!this.started) this.renderIdleState();
    }

    start(cards: Card[], deckName?: string, startIndex = 0): void {
        this.cards = cards;
        this.deckName = deckName || null;
        this.index = Math.max(0, Math.min(startIndex, cards.length - 1));
        this.started = true;
        this.active = true;
        this.renderComponent.unload();
        this.renderComponent = new Component();
        this.contentEl.empty();
        this.setupUI();
        void this.displayCard();
        const header = this.leaf as unknown as { tabHeaderInnerTitleEl?: HTMLElement };
        header.tabHeaderInnerTitleEl?.setText?.(this.deckName ?? '浏览');
    }

    async onClose(): Promise<void> {
        this.renderComponent.unload();
        this.contentEl.empty();
    }

    private finish(): void {
        this.leaf.detach();
    }

    private renderIdleState(): void {
        const box = this.contentEl.createDiv({ cls: 'fsrs-review-idle' });
        box.createEl('h3', { text: '卡片浏览' });
        box.createEl('p', { text: '从 MGO 仪表盘选择一个牌组开始浏览。' });
    }

    private setupUI(): void {
        const container = this.contentEl.createDiv({ cls: 'fsrs-review-container' });

        const topbar = container.createDiv({ cls: 'fsrs-review-topbar' });
        const closeBtn = topbar.createDiv({ cls: 'fsrs-review-icon-btn', attr: { 'aria-label': '关闭浏览' } });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.finish());

        topbar.createDiv({ cls: 'fsrs-review-deck', text: this.deckName ?? '浏览' });
        topbar.createSpan({ cls: 'fsrs-review-mode', text: '浏览' });

        topbar.createDiv({ cls: 'fsrs-review-topbar-spacer' });
        this.counterEl = topbar.createDiv({ cls: 'fsrs-review-counter' });
        const progress = topbar.createDiv({ cls: 'fsrs-review-progress' });
        this.progressFill = progress.createDiv({ cls: 'fsrs-review-progress-fill' });

        const sourceBtn = topbar.createDiv({ cls: 'fsrs-review-icon-btn', attr: { 'aria-label': '打开原文笔记' } });
        setIcon(sourceBtn, 'file-text');
        sourceBtn.addEventListener('click', () => void openCardSource(this.app, this.cards[this.index]));

        const body = container.createDiv({ cls: 'fsrs-review-body' });
        this.cardContainer = body.createDiv({ cls: 'fsrs-review-card' });
        this.cardContainer.setCssProps({ '--fsrs-card-font-size': `${this.plugin.settings.fontSize}px` });

        this.contextEl = this.cardContainer.createDiv({ cls: 'fsrs-card-context' });
        this.contextEl.addEventListener('click', () => void openCardSource(this.app, this.cards[this.index]));

        this.frontEl = this.cardContainer.createDiv({ cls: 'fsrs-card-front' });
        const answerContainer = this.cardContainer.createDiv({ cls: 'fsrs-card-answer' });
        answerContainer.createEl('hr');
        this.backEl = answerContainer.createDiv({ cls: 'fsrs-card-back' });

        const footer = container.createDiv({ cls: 'fsrs-browse-footer' });
        this.prevBtn = footer.createEl('button', {
            cls: 'fsrs-browse-nav-btn',
            attr: { 'aria-label': '上一张卡片' },
        });
        setIcon(this.prevBtn, 'arrow-left');
        this.prevBtn.addEventListener('click', () => this.showPrevCard());

        const sourceTextBtn = footer.createEl('button', {
            cls: 'fsrs-browse-source-btn',
            text: '打开原文笔记',
        });
        sourceTextBtn.addEventListener('click', () => void openCardSource(this.app, this.cards[this.index]));

        this.nextBtn = footer.createEl('button', {
            cls: 'fsrs-browse-nav-btn',
            attr: { 'aria-label': '下一张卡片' },
        });
        setIcon(this.nextBtn, 'arrow-right');
        this.nextBtn.addEventListener('click', () => this.showNextCard());
    }

    private async displayCard(): Promise<void> {
        const card = this.cards[this.index];
        if (!card) return;
        const total = this.cards.length;
        this.counterEl.setText(`${this.index + 1} / ${total}`);
        this.progressFill.style.width = total > 0 ? `${Math.round(((this.index + 1) / total) * 100)}%` : '0%';

        if (card.context) {
            this.contextEl.setText(card.context);
            this.contextEl.show();
        } else {
            this.contextEl.hide();
        }

        this.frontEl.empty();
        this.backEl.empty();
        await MarkdownRenderer.render(this.app, toHardBreaks(card.front), this.frontEl, card.filePath, this.renderComponent);
        await MarkdownRenderer.render(this.app, toHardBreaks(card.back), this.backEl, card.filePath, this.renderComponent);

        this.prevBtn.disabled = this.index === 0;
        this.nextBtn.disabled = this.index >= total - 1;
    }

    private showPrevCard(): void {
        if (this.index > 0) {
            this.index--;
            void this.displayCard();
        }
    }

    private showNextCard(): void {
        if (this.index < this.cards.length - 1) {
            this.index++;
            void this.displayCard();
        }
    }

    private handleKeyPress(evt: KeyboardEvent): void {
        if (!this.active) return;
        if (evt.key === 'Escape') {
            this.finish();
            return;
        }
        const typing = evt.target instanceof HTMLInputElement || evt.target instanceof HTMLTextAreaElement;
        if (typing) return;
        if (evt.key === 'ArrowLeft') {
            evt.preventDefault();
            this.showPrevCard();
        } else if (evt.key === 'ArrowRight') {
            evt.preventDefault();
            this.showNextCard();
        } else if (evt.key.toLowerCase() === 'e' && !evt.shiftKey && !evt.altKey && !evt.ctrlKey && !evt.metaKey) {
            evt.preventDefault();
            void openCardSource(this.app, this.cards[this.index]);
        }
    }
}