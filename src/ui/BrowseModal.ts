import { App, Modal, ButtonComponent, Component, MarkdownRenderer } from 'obsidian';
import type { Card } from '../data/types';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class BrowseModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private cards: Card[];
    private deckName: string;
    private currentCardIndex = 0;

    private cardContainer: HTMLElement;
    private frontEl: HTMLElement;
    private backEl: HTMLElement;
    private answerContainer: HTMLElement;
    private prevButton: ButtonComponent;
    private nextButton: ButtonComponent;
    private renderComponent: Component = new Component();

    constructor(app: App, plugin: FSRSFlashcardsPlugin, cards: Card[], deckName?: string) {
        super(app);
        this.plugin = plugin;
        this.cards = cards;
        this.deckName = deckName || '未知牌组';
    }

    onOpen() {
        this.renderComponent = new Component();
        this.containerEl.addClass('fsrs-review-modal-immersive');
        this.contentEl.empty();
        this.titleEl.setText(`浏览：${this.deckName}`);
        this.setupUI();
        void this.displayCurrentCard();
        for (const key of ['ArrowLeft', 'ArrowRight']) {
            this.scope.register([], key, (evt: KeyboardEvent) => this.handleKeyPress(evt));
        }
    }

    private setupUI() {
        const container = this.contentEl.createDiv({ cls: 'fsrs-review-container' });
        container.addClass('fsrs-browse-container');

        const leftControl = container.createDiv();
        this.prevButton = new ButtonComponent(leftControl)
            .setIcon('arrow-left')
            .setTooltip('上一张卡片（左方向键）')
            .onClick(() => this.showPrevCard());

        const cardWrapper = container.createDiv();
        cardWrapper.addClass('fsrs-browse-card-wrapper');

        this.cardContainer = cardWrapper.createDiv({ cls: 'fsrs-review-card' });
        this.cardContainer.setCssProps({ '--fsrs-card-font-size': `${this.plugin.settings.fontSize}px` });
        this.frontEl = this.cardContainer.createDiv({ cls: 'fsrs-card-front' });
        this.answerContainer = this.cardContainer.createDiv({ cls: 'fsrs-card-answer' });
        this.answerContainer.createEl('hr');
        this.backEl = this.answerContainer.createDiv({ cls: 'fsrs-card-back' });

        const rightControl = container.createDiv();
        this.nextButton = new ButtonComponent(rightControl)
            .setIcon('arrow-right')
            .setTooltip('下一张卡片（右方向键）')
            .onClick(() => this.showNextCard());

        const openBtn = cardWrapper.createDiv({ cls: 'fsrs-browse-open-row' }).createEl('button', {
            cls: 'fsrs-browse-open-btn',
            text: '打开原文笔记',
        });
        openBtn.addEventListener('click', () => this.openCurrentCardFile());
    }

    private openCurrentCardFile() {
        const card = this.cards[this.currentCardIndex];
        if (!card) return;
        let link = card.filePath;
        const blockMatch = card.id.match(/::([a-zA-Z0-9-]+)$/);
        if (blockMatch) {
            const blockId = blockMatch[1].replace(/-\d+$/, '');
            link += '#^' + blockId;
        }
        this.close();
        void this.app.workspace.openLinkText(link, card.filePath, false);
    }

    private async displayCurrentCard() {
        const card = this.cards[this.currentCardIndex];
        this.titleEl.empty();
        this.titleEl.createSpan({ text: `浏览中（${this.currentCardIndex + 1}/${this.cards.length}）` });
        if (this.plugin.dataManager.isLeech?.(card)) {
            const lapses = card.fsrsData?.lapses ?? 0;
            this.titleEl.createSpan({
                text: `困难卡（遗忘 ${lapses} 次）`,
                cls: 'fsrs-leech-badge',
                attr: { title: '这张卡片反复遗忘，建议简化、拆分或重写。' },
            });
        }

        this.frontEl.empty();
        this.backEl.empty();
        await MarkdownRenderer.render(this.app, card.front, this.frontEl, card.filePath, this.renderComponent);
        await MarkdownRenderer.render(this.app, card.back, this.backEl, card.filePath, this.renderComponent);

        this.updateNavButtons();
    }

    private showPrevCard() {
        if (this.currentCardIndex > 0) {
            this.currentCardIndex--;
            void this.displayCurrentCard();
        }
    }

    private showNextCard() {
        if (this.currentCardIndex < this.cards.length - 1) {
            this.currentCardIndex++;
            void this.displayCurrentCard();
        }
    }

    private updateNavButtons() {
        this.prevButton.setDisabled(this.currentCardIndex === 0);
        this.nextButton.setDisabled(this.currentCardIndex === this.cards.length - 1);
    }

    private handleKeyPress(evt: KeyboardEvent) {
        evt.preventDefault();
        switch (evt.key) {
            case 'Escape':
                this.close();
                break;
            case 'ArrowLeft':
                this.showPrevCard();
                break;
            case 'ArrowRight':
                this.showNextCard();
                break;
        }
    }

    onClose() {
        this.renderComponent.unload();
        this.contentEl.empty();
    }
}
