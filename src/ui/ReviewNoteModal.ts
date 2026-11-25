import { App, Modal, ButtonComponent, Notice, Component, setIcon, MarkdownRenderer, TFile } from 'obsidian';
import { Rating } from 'ts-fsrs';
import type { NoteReviewData } from '../data/types';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class ReviewNoteModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private queue: NoteReviewData[];
    private currentIndex = 0;
    private renderComponent: Component = new Component();

    constructor(app: App, plugin: FSRSFlashcardsPlugin, queue: NoteReviewData[]) {
        super(app);
        this.plugin = plugin;
        this.queue = queue;
    }

    onOpen() {
        this.renderComponent = new Component();
        this.containerEl.addClass('fsrs-review-modal-immersive');
        this.titleEl.setText(`复习笔记（${this.currentIndex + 1}/${this.queue.length}）`);
        this.contentEl.empty();
        this.setupUI();
        void this.showCurrentNote();
        for (const key of ['1', '2', '3', '4']) {
            this.scope.register([], key, (evt: KeyboardEvent) => this.handleKeyPress(evt));
        }
    }

    onClose() {
        this.renderComponent.unload();
        this.contentEl.empty();
        this.plugin.refreshDashboardView();
    }

    private setupUI() {
        const container = this.contentEl.createDiv({ cls: 'fsrs-review-container' });

        const noteContainer = container.createDiv({ cls: 'fsrs-review-card' });

        const headerEl = noteContainer.createDiv({ cls: 'fsrs-note-review-header' });
        const noteData = this.getCurrentNote();
        setIcon(headerEl.createSpan({ cls: 'fsrs-note-review-icon' }), 'file-text');
        headerEl.createSpan({ text: noteData.filePath.split('/').pop() || '未命名', cls: 'fsrs-note-review-title' });

        noteContainer.createDiv({ cls: 'fsrs-note-review-content fsrs-note-preview' });

        new ButtonComponent(container)
            .setButtonText('在编辑器中打开笔记')
            .setCta()
            .onClick(() => {
                const current = this.getCurrentNote();
                void this.app.workspace.openLinkText(current.filePath, current.filePath);
            });

        const ratingSection = container.createDiv({ cls: 'fsrs-review-controls fsrs-note-rating-section' });

        const ratings: Array<{ text: string; rating: Exclude<Rating, Rating.Manual>; cls: string }> = [
            { text: '重来', rating: Rating.Again, cls: 'fsrs-rating-again' },
            { text: '困难', rating: Rating.Hard, cls: 'fsrs-rating-hard' },
            { text: '良好', rating: Rating.Good, cls: 'fsrs-rating-good' },
            { text: '简单', rating: Rating.Easy, cls: 'fsrs-rating-easy' },
        ];

        for (const { text, rating, cls } of ratings) {
            const btn = new ButtonComponent(ratingSection)
                .onClick(() => this.handleRating(rating));
            btn.buttonEl.addClass(cls);
            btn.buttonEl.createSpan({ text, cls: 'fsrs-rating-text' });
        }

        new ButtonComponent(container)
            .setButtonText('跳过')
            .onClick(() => this.nextNote());
    }

    private async showCurrentNote() {
        const noteData = this.getCurrentNote();
        this.titleEl.setText(`复习笔记（${this.currentIndex + 1}/${this.queue.length}）`);

        const titleEl = this.contentEl.querySelector('.fsrs-note-review-title');
        if (titleEl) {
            titleEl.textContent = noteData.filePath.split('/').pop() || '未命名';
        }

        const previewEl = this.contentEl.querySelector('.fsrs-note-preview');
        if (previewEl instanceof HTMLElement) {
            previewEl.empty();
            const file = this.app.vault.getAbstractFileByPath(noteData.filePath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
                await MarkdownRenderer.render(this.app, cleanContent, previewEl, noteData.filePath, this.renderComponent);
            }
        }
    }

    private getCurrentNote(): NoteReviewData {
        return this.queue[this.currentIndex];
    }

    private handleRating(rating: Rating) {
        const note = this.getCurrentNote();
        this.plugin.dataManager.rateNote(note.filePath, rating);
        this.nextNote();
    }

    private nextNote() {
        this.currentIndex++;
        if (this.currentIndex >= this.queue.length) {
            this.close();
            new Notice('笔记复习完成！');
            return;
        }
        void this.showCurrentNote();
    }

    private handleKeyPress(evt: KeyboardEvent) {
        if (evt.key === 'Escape') {
            this.close();
            return;
        }
        switch (evt.key) {
            case '1':
                evt.preventDefault();
                this.handleRating(Rating.Again);
                break;
            case '2':
                evt.preventDefault();
                this.handleRating(Rating.Hard);
                break;
            case '3':
                evt.preventDefault();
                this.handleRating(Rating.Good);
                break;
            case '4':
                evt.preventDefault();
                this.handleRating(Rating.Easy);
                break;
        }
    }
}
