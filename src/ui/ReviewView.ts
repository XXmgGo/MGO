import { ButtonComponent, Component, ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf, setIcon, type ViewStateResult } from 'obsidian';
import { Rating, State } from 'ts-fsrs';
import type { Card } from '../data/types';
import { VIEW_ICON_NAME, VIEW_TYPE_REVIEW, isInPlaceImageCard, toHardBreaks } from '../data/constants';
import { openCardSource } from './cardSource';
import { resolveAudioSrc } from './audioSrc';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;
const SWIPE_THRESHOLD = 60;
const LEARN_AHEAD_MS = 30 * 60 * 1000;
const REQUEUE_GAP = 4;

export class ReviewView extends ItemView {
    private plugin: FSRSFlashcardsPlugin;
    private queue: Card[] = [];
    private deckName: string | null = null;
    private reviewMode = '复习・按计划';
    private started = false;
    private active = false;
    private currentCardIndex = 0;
    private undoButton: HTMLElement | null = null;
    private state: 'question' | 'answer' = 'question';
    private isInPlaceImage = false;
    private activeInPlaceView: 'question' | 'answer' = 'question';
    private cardContainer: HTMLElement;
    private frontEl: HTMLElement;
    private backEl: HTMLElement;
    private answerContainer: HTMLElement;
    private inplaceIndicatorEl: HTMLElement;
    private controlsContainer: HTMLElement;
    private showAnswerButton: ButtonComponent;
    private renderComponent: Component = new Component();
    private typeinContainer: HTMLElement;
    private typeinInput: HTMLInputElement;
    private typeinFeedback: HTMLElement;
    private typeinCheckBtn: ButtonComponent;
    private reviewShell: HTMLElement | null = null;
    private topbarEl: HTMLElement | null = null;
    private visibleCounter: HTMLElement | null = null;
    private progressFill: HTMLElement | null = null;
    private moreMenu: HTMLElement | null = null;
    private menuOutsideHandler: ((evt: MouseEvent) => void) | null = null;
    private cardHeaderEl: HTMLElement | null = null;
    private audioBtn: HTMLElement | null = null;
    private audioPlayer: HTMLAudioElement | null = null;
    private audioHint: HTMLElement | null = null;
    private audioHintDivider: HTMLElement | null = null;

    private gestureStartX = 0;
    private gestureStartY = 0;
    private gestureCurrentX = 0;
    private gestureCurrentY = 0;
    private isGesturing = false;
    private boundHandlers: Array<{ target: EventTarget; type: string; handler: EventListener }> = [];

    constructor(leaf: WorkspaceLeaf, plugin: FSRSFlashcardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_REVIEW; }

    getDisplayText(): string { return this.deckName ?? '复习'; }

    getIcon(): string { return VIEW_ICON_NAME; }

    async setState(state: unknown, _result: ViewStateResult): Promise<void> {
        const s = (state ?? {}) as { deckName?: string; mode?: string };
        if (typeof s.deckName === 'string') this.deckName = s.deckName;
        if (typeof s.mode === 'string') this.reviewMode = s.mode;
    }

    async onOpen(): Promise<void> {
        this.containerEl.addClass('fsrs-review-view');
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => this.handleKeyPress(evt));
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            this.active = leaf === this.leaf;
        }));
        if (!this.started) this.renderIdleState();
    }

    /** 由插件打开标签页后调用，注入本次复习队列。 */
    start(queue: Card[], deckName?: string, modeLabel = '复习・按计划'): void {
        this.queue = queue;
        this.deckName = deckName || null;
        this.reviewMode = modeLabel;
        this.currentCardIndex = 0;
        this.buriedStack = [];
        this.started = true;
        this.active = true;
        this.renderComponent = new Component();
        this.contentEl.empty();
        this.setupUI();
        void this.showNextCard();
        const header = this.leaf as unknown as { tabHeaderInnerTitleEl?: HTMLElement };
        header.tabHeaderInnerTitleEl?.setText?.(this.deckName ?? '复习');
    }

    async onClose(): Promise<void> {
        this.stopAudio();
        this.closeMoreMenu();
        for (const { target, type, handler } of this.boundHandlers) {
            target.removeEventListener(type, handler);
        }
        this.boundHandlers = [];
        this.renderComponent.unload();
        this.contentEl.empty();
        this.plugin.refreshDashboardView();
    }

    /** 结束复习：把这个标签页关掉。 */
    private finish(): void {
        this.leaf.detach();
    }

    private renderIdleState(): void {
        const box = this.contentEl.createDiv({ cls: 'fsrs-review-idle' });
        box.createEl('h3', { text: '复习标签页' });
        box.createEl('p', { text: '从 MGO 仪表盘选择一个牌组开始复习。' });
    }

    private setupUI() {
        const container = this.contentEl.createDiv({ cls: 'fsrs-review-container' });
        this.reviewShell = container;

        // 顶栏：关闭 · 牌组 · 模式 · 进度 · 原文 · 更多
        const topbar = container.createDiv({ cls: 'fsrs-review-topbar' });
        this.topbarEl = topbar;

        const closeBtn = topbar.createDiv({ cls: 'fsrs-review-icon-btn fsrs-review-close', attr: { 'aria-label': '结束复习' } });
        setIcon(closeBtn, 'x');
        closeBtn.addEventListener('click', () => this.finish());

        const deckEl = topbar.createDiv({ cls: 'fsrs-review-deck', text: this.deckName ?? '复习中' });
        deckEl.addEventListener('click', () => this.showCardInfo());
        topbar.createSpan({ cls: 'fsrs-review-mode', text: this.reviewMode });

        topbar.createDiv({ cls: 'fsrs-review-topbar-spacer' });
        this.visibleCounter = topbar.createDiv({ cls: 'fsrs-review-counter' });
        const progress = topbar.createDiv({ cls: 'fsrs-review-progress' });
        this.progressFill = progress.createDiv({ cls: 'fsrs-review-progress-fill' });

        const refreshBtn = topbar.createDiv({ cls: 'fsrs-review-icon-btn', attr: { 'aria-label': '刷新卡片（R）' } });
        setIcon(refreshBtn, 'refresh-cw');
        refreshBtn.addEventListener('click', () => void this.refreshCurrentCard());

        const sourceBtn = topbar.createDiv({ cls: 'fsrs-review-icon-btn', attr: { 'aria-label': '打开原文笔记' } });
        setIcon(sourceBtn, 'file-text');
        sourceBtn.addEventListener('click', () => void this.openCardSource());

        const moreBtn = topbar.createDiv({ cls: 'fsrs-review-icon-btn fsrs-review-more', attr: { 'aria-label': '更多操作' } });
        setIcon(moreBtn, 'more-vertical');
        moreBtn.addEventListener('click', (evt: MouseEvent) => {
            evt.stopPropagation();
            this.toggleMoreMenu();
        });

        // 中部：卡片
        const body = container.createDiv({ cls: 'fsrs-review-body' });

        this.cardContainer = body.createDiv({ cls: 'fsrs-review-card' });
        this.cardContainer.setCssProps({ '--fsrs-card-font-size': `${this.plugin.settings.fontSize}px` });

        const header = this.cardContainer.createDiv({ cls: 'fsrs-card-header' });
        this.cardHeaderEl = header;

        const contextEl = header.createDiv({ cls: 'fsrs-card-context' });
        contextEl.addEventListener('click', () => void this.openCardSource());
        const firstCard = this.getCurrentCard();
        if (firstCard.context) {
            contextEl.setText(firstCard.context);
            contextEl.setAttribute('title', firstCard.context);
        } else {
            contextEl.addClass('fsrs-card-context-hidden');
        }

        // 卡片右上角的语音入口：播放这张卡的 audio 属性
        this.audioBtn = header.createDiv({
            cls: 'fsrs-card-audio-btn',
            attr: { role: 'button', tabindex: '0', 'aria-label': '播放语音' },
        });
        setIcon(this.audioBtn, 'volume-2');
        this.audioBtn.hide();
        this.audioBtn.addEventListener('click', (evt: MouseEvent) => {
            evt.stopPropagation();
            this.toggleAudio();
        });
        this.audioBtn.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key !== 'Enter' && evt.key !== ' ') return;
            evt.preventDefault();
            this.toggleAudio();
        });

        this.frontEl = this.cardContainer.createDiv({ cls: 'fsrs-card-front' });
        this.answerContainer = this.cardContainer.createDiv({ cls: 'fsrs-card-answer' });
        this.answerContainer.hide();
        this.answerContainer.createEl('hr');
        this.backEl = this.answerContainer.createDiv({ cls: 'fsrs-card-back' });
        this.inplaceIndicatorEl = this.cardContainer.createDiv({ cls: 'fsrs-inplace-indicator' });
        this.inplaceIndicatorEl.hide();

        this.typeinContainer = body.createDiv({ cls: 'fsrs-typein-container' });

        // 底栏：显示答案 / 评级按钮 + 快捷键提示
        const footer = container.createDiv({ cls: 'fsrs-review-footer' });
        const bottomControlsContainer = footer.createDiv({ cls: 'fsrs-bottom-controls' });

        this.showAnswerButton = new ButtonComponent(bottomControlsContainer)
            .setButtonText('显示答案')
            .setCta()
            .onClick(() => this.showAnswer());
        this.showAnswerButton.buttonEl.addClass('fsrs-show-answer-btn');
        this.showAnswerButton.buttonEl.createEl('kbd', { text: '空格键', cls: 'fsrs-show-answer-kbd' });

        this.controlsContainer = bottomControlsContainer.createDiv({ cls: 'fsrs-review-controls' });
        this.controlsContainer.hide();

        const hints = footer.createDiv({ cls: 'fsrs-review-hints' });
        const editHint = hints.createSpan({ cls: 'fsrs-review-hint', attr: { 'aria-label': '编辑此卡片' } });
        editHint.createEl('kbd', { text: 'E' });
        editHint.createSpan({ text: ' 编辑' });
        editHint.addEventListener('click', () => void this.openCardSource());

        hints.createSpan({ cls: 'fsrs-review-hint-divider', text: '·' });

        const refreshHint = hints.createSpan({ cls: 'fsrs-review-hint', attr: { 'aria-label': '刷新卡片' } });
        refreshHint.createEl('kbd', { text: 'R' });
        refreshHint.createSpan({ text: ' 刷新' });
        refreshHint.addEventListener('click', () => void this.refreshCurrentCard());

        this.audioHintDivider = hints.createSpan({ cls: 'fsrs-review-hint-divider', text: '·' });
        this.audioHintDivider.hide();

        this.audioHint = hints.createSpan({ cls: 'fsrs-review-hint', attr: { 'aria-label': '播放语音' } });
        this.audioHint.createEl('kbd', { text: 'A' });
        this.audioHint.createSpan({ text: ' 发音' });
        this.audioHint.addEventListener('click', () => this.toggleAudio());
        this.audioHint.hide();

        hints.createSpan({ cls: 'fsrs-review-hint-divider', text: '·' });

        this.undoButton = hints.createSpan({ cls: 'fsrs-review-hint', attr: { 'aria-label': '撤销上次评分' } });
        this.undoButton.createEl('kbd', { text: '⌘' + 'Z' });
        this.undoButton.createSpan({ text: ' 撤销' });
        this.undoButton.addEventListener('click', () => this.undoRating());

        hints.createSpan({ cls: 'fsrs-review-hint-divider', text: '·' });

        const escHint = hints.createSpan({ cls: 'fsrs-review-hint' });
        escHint.createEl('kbd', { text: 'Esc' });
        escHint.createSpan({ text: ' 结束复习' });
        escHint.addEventListener('click', () => this.finish());
        this.typeinContainer.hide();

        this.typeinInput = this.typeinContainer.createEl('input', {
            cls: 'fsrs-typein-input',
            attr: { type: 'text', placeholder: '输入答案...', autocomplete: 'off', spellcheck: 'false' },
        });
        this.typeinFeedback = this.typeinContainer.createDiv({ cls: 'fsrs-typein-feedback' });
        this.typeinFeedback.hide();

        this.typeinInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.typeinCheckBtn.buttonEl.click();
            }
        });

        this.typeinCheckBtn = new ButtonComponent(this.typeinContainer)
            .setButtonText('检查')
            .setCta()
            .onClick(() => {
                const card = this.getCurrentCard();
                const typed = this.typeinInput.value.trim();
                const correct = card.back.trim();
                if (!typed) return;

                const exactMatch = typed.toLowerCase() === correct.toLowerCase();
                const keywordMatch = !exactMatch && correct.toLowerCase().split(/\s+/).some(word =>
                    word.length > 3 && typed.toLowerCase().includes(word.toLowerCase())
                );

                this.typeinFeedback.empty();
                this.typeinFeedback.show();
                this.typeinInput.disabled = true;
                this.typeinCheckBtn.setDisabled(true);

                if (exactMatch) {
                    this.typeinFeedback.createSpan({ text: '回答正确', cls: 'fsrs-typein-correct' });
                } else if (keywordMatch) {
                    this.typeinFeedback.createSpan({ text: '接近正确', cls: 'fsrs-typein-partial' });
                } else {
                    this.typeinFeedback.createSpan({ text: '回答错误', cls: 'fsrs-typein-wrong' });
                }
                this.typeinFeedback.createEl('p', { text: `正确答案：${correct}`, cls: 'fsrs-typein-answer' });

                this.createControlButtons();
                this.state = 'answer';
                this.controlsContainer.show();
                this.showAnswerButton.buttonEl.hide();
                this.answerContainer.show();
            });
        this.typeinCheckBtn.buttonEl.addClass('fsrs-typein-check-btn');

        const addHandler = (target: EventTarget, type: string, handler: EventListener) => {
            target.addEventListener(type, handler);
            this.boundHandlers.push({ target, type, handler });
        };
        addHandler(this.cardContainer, 'pointerdown', (e: Event) => this.onGestureStart(e as PointerEvent));
        addHandler(this.cardContainer, 'pointermove', (e: Event) => this.onGestureMove(e as PointerEvent));
        addHandler(this.cardContainer, 'pointerup', (e: Event) => this.onGestureEnd(e as PointerEvent));
        addHandler(this.cardContainer, 'pointerleave', (e: Event) => this.onGestureEnd(e as PointerEvent));
        this.updateUndoButton();
    }

    private updateChrome() {
        const total = this.queue.length;
        const answered = this.currentCardIndex;
        if (this.visibleCounter) this.visibleCounter.setText(`${answered} / ${total}`);
        if (this.progressFill) {
            this.progressFill.style.width = total > 0 ? `${Math.round((answered / total) * 100)}%` : '0%';
        }
    }

    private showCardInfo() {
        const data = this.getCurrentCard().fsrsData;
        if (!data) { new Notice('这是一张新卡片。'); return; }
        const info = `稳定性：${data.stability.toFixed(2)}\n难度：${data.difficulty.toFixed(2)}\n复习次数：${data.reps}\n遗忘次数：${data.lapses}\n到期日：${data.due.toLocaleDateString()}`;
        new Notice(info, 10000);
    }

    /** 打开这张卡片的原文笔记，并滚动到卡片块的位置。 */
    private async openCardSource(): Promise<void> {
        this.closeMoreMenu();
        const card = this.getCurrentCard();
        if (!card) return;
        await openCardSource(this.app, card);
    }

    /** 重新读取当前卡片的原文笔记，替换队列里的旧内容并重新渲染。 */
    private async refreshCurrentCard(): Promise<void> {
        const card = this.getCurrentCard();
        if (!card) return;

        const file = this.app.vault.getAbstractFileByPath(card.filePath);
        if (!(file instanceof TFile)) {
            new Notice('找不到这张卡片的原文笔记。');
            return;
        }

        const oldFileCards = this.plugin.dataManager.getAllCards().filter((c) => c.filePath === card.filePath);
        const oldIndex = oldFileCards.findIndex((c) => c.id === card.id);

        await this.plugin.dataManager.updateFile(file);

        const pool = this.plugin.dataManager.getAllCards().filter((c) => c.filePath === card.filePath);
        const next = pool.find((c) => c.id === card.id)
            ?? pool.find((c) => c.front === card.front && c.back === card.back)
            ?? (oldIndex >= 0 ? pool[oldIndex] : undefined)
            ?? pool[0];
        if (!next) {
            new Notice('原文里已经找不到这张卡片了。');
            return;
        }

        this.queue[this.currentCardIndex] = next;
        this.plugin.refreshDashboardView();
        new Notice('已刷新卡片内容');
        void this.showNextCard();
    }

    private toggleMoreMenu() {
        if (this.moreMenu) { this.closeMoreMenu(); return; }
        const menu = (this.topbarEl ?? this.reviewShell ?? this.contentEl).createDiv({ cls: 'fsrs-review-more-menu' });
        const item = (label: string, fn: () => void) => {
            const el = menu.createDiv({ cls: 'fsrs-review-more-item', text: label });
            el.addEventListener('click', () => { this.closeMoreMenu(); fn(); });
        };
        item('打开原文笔记', () => void this.openCardSource());
        item('撤销上次评分', () => this.undoRating());
        item('结束复习', () => this.finish());
        this.moreMenu = menu;
        const closeOnOutside = (evt: MouseEvent) => {
            if (!this.moreMenu) {
                document.removeEventListener('click', closeOnOutside);
                this.menuOutsideHandler = null;
                return;
            }
            if (!this.moreMenu.contains(evt.target as Node)) this.closeMoreMenu();
        };
        this.menuOutsideHandler = closeOnOutside;
        window.setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    }

    private closeMoreMenu() {
        this.moreMenu?.remove();
        this.moreMenu = null;
        if (this.menuOutsideHandler) {
            document.removeEventListener('click', this.menuOutsideHandler);
            this.menuOutsideHandler = null;
        }
    }

    private onGestureStart(e: PointerEvent) {
        if (this.state !== 'answer') return;
        this.isGesturing = true;
        this.gestureStartX = e.clientX;
        this.gestureStartY = e.clientY;
        this.gestureCurrentX = e.clientX;
        this.gestureCurrentY = e.clientY;
    }

    private onGestureMove(e: PointerEvent) {
        if (!this.isGesturing || this.state !== 'answer') return;
        this.gestureCurrentX = e.clientX;
        this.gestureCurrentY = e.clientY;

        const dx = this.gestureCurrentX - this.gestureStartX;
        const dy = this.gestureCurrentY - this.gestureStartY;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
            this.cardContainer.setCssProps({
                '--fsrs-swipe-dx': `${dx * 0.4}px`,
                '--fsrs-swipe-dy': `${dy * 0.2}px`,
                '--fsrs-swipe-rot': `${dx * 0.02}deg`,
            });
            const direction = this.getSwipeDirection(dx, dy);
            this.cardContainer.removeClass('fsrs-swipe-left', 'fsrs-swipe-right', 'fsrs-swipe-up', 'fsrs-swipe-down');
            if (direction) {
                this.cardContainer.addClass(`fsrs-swipe-${direction}`);
            }
        }
    }

    private onGestureEnd(e: PointerEvent) {
        if (!this.isGesturing) return;
        this.isGesturing = false;

        const dx = this.gestureCurrentX - this.gestureStartX;
        const dy = this.gestureCurrentY - this.gestureStartY;
        const direction = this.getSwipeDirection(dx, dy);

        this.cardContainer.setCssProps({ '--fsrs-swipe-dx': '', '--fsrs-swipe-dy': '', '--fsrs-swipe-rot': '' });
        this.cardContainer.removeClass('fsrs-swipe-left', 'fsrs-swipe-right', 'fsrs-swipe-up', 'fsrs-swipe-down');

        if (!direction || this.state !== 'answer') {
            if (e.type === 'pointerup' && this.isInPlaceImage && this.state === 'answer' && Math.hypot(dx, dy) < 10) {
                this.toggleInPlaceView();
            }
            return;
        }

        const ratingMap: Record<string, Rating> = {
            left: Rating.Again,
            down: Rating.Hard,
            right: Rating.Good,
            up: Rating.Easy,
        };

        const rating = ratingMap[direction];
        if (rating !== undefined) {
            this.handleRating(rating);
        }
    }

    private getSwipeDirection(dx: number, dy: number): SwipeDirection {
        if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return null;

        if (Math.abs(dx) >= Math.abs(dy)) {
            return dx < 0 ? 'left' : 'right';
        } else {
            return dy < 0 ? 'up' : 'down';
        }
    }

    private createControlButtons() {
        this.controlsContainer.empty();
        this.controlsContainer.show();
        const card = this.getCurrentCard();
        const intervals = this.plugin.dataManager.getNextReviewIntervals(card);

        const ratings: Array<{ text: string; rating: Exclude<Rating, Rating.Manual>; cls: string }> = [
            { text: '重来', rating: Rating.Again, cls: 'fsrs-rating-again' },
            { text: '困难', rating: Rating.Hard, cls: 'fsrs-rating-hard' },
            { text: '良好', rating: Rating.Good, cls: 'fsrs-rating-good' },
            { text: '简单', rating: Rating.Easy, cls: 'fsrs-rating-easy' },
        ];

        for (const { text, rating, cls } of ratings) {
            const btn = new ButtonComponent(this.controlsContainer)
                .onClick(() => this.handleRating(rating));
            btn.buttonEl.addClass(cls);
            btn.buttonEl.createSpan({ text, cls: 'fsrs-rating-text' });
            btn.buttonEl.createEl('small', { text: intervals[rating], cls: 'fsrs-interval-hint' });
        }
    }

    private async showNextCard() {
        if (this.currentCardIndex >= this.queue.length) { this.showCompletionScreen(); return; }

        this.answerContainer.hide();
        this.controlsContainer.hide();

        this.state = 'question';
        const card = this.getCurrentCard();
        this.isInPlaceImage = card.type !== 'typein' && isInPlaceImageCard(card);
        this.activeInPlaceView = 'question';

        if (this.isInPlaceImage) {
            this.cardContainer.addClass('fsrs-card-inplace');
        } else {
            this.cardContainer.removeClass('fsrs-card-inplace');
        }
        this.inplaceIndicatorEl.hide();

        this.closeMoreMenu();
        this.updateChrome();

        this.frontEl.empty();
        this.backEl.empty();

        const contextEl = this.cardContainer.querySelector('.fsrs-card-context') as HTMLElement;
        if (contextEl) {
            if (card.context) {
                contextEl.setText(card.context);
                contextEl.setAttribute('title', card.context);
                contextEl.removeClass('fsrs-card-context-hidden');
            } else {
                contextEl.addClass('fsrs-card-context-hidden');
                contextEl.removeAttribute('title');
            }
        }

        this.frontEl.show();
        await MarkdownRenderer.render(this.app, toHardBreaks(card.front), this.frontEl, card.filePath, this.renderComponent);
        await MarkdownRenderer.render(this.app, toHardBreaks(card.back), this.backEl, card.filePath, this.renderComponent);
        this.syncAudioUi(card);

        if (card.type === 'typein') {
            this.showAnswerButton.buttonEl.hide();
            this.typeinContainer.show();
            this.typeinInput.value = '';
            this.typeinInput.disabled = false;
            this.typeinCheckBtn.setDisabled(false);
            this.typeinFeedback.empty();
            this.typeinFeedback.hide();
            this.typeinInput.focus();
        } else {
            this.showAnswerButton.buttonEl.show();
            this.typeinContainer.hide();
        }
    }

    /** 卡片切换时同步语音入口：audio 能解析出播放地址才显示小喇叭和「A 发音」提示。 */
    private syncAudioUi(card: Card): void {
        this.stopAudio();
        const hasAudio = Boolean(resolveAudioSrc(this.app, card.audio));
        if (this.audioBtn) {
            if (hasAudio) this.audioBtn.show(); else this.audioBtn.hide();
        }
        if (this.audioHint) {
            if (hasAudio) this.audioHint.show(); else this.audioHint.hide();
        }
        if (this.audioHintDivider) {
            if (hasAudio) this.audioHintDivider.show(); else this.audioHintDivider.hide();
        }
        this.cardHeaderEl?.classList.toggle('is-empty', !card.context && !hasAudio);
    }

    private stopAudio(): void {
        if (this.audioPlayer) {
            try { this.audioPlayer.pause(); } catch { /* 元素可能已被卸载 */ }
            this.audioPlayer = null;
        }
        if (this.audioBtn) {
            this.audioBtn.removeClass('is-playing');
            setIcon(this.audioBtn, 'volume-2');
            this.audioBtn.setAttribute('aria-label', '播放语音');
        }
    }

    /** 播放 / 停止当前卡片的语音。 */
    private toggleAudio(): void {
        const url = resolveAudioSrc(this.app, this.getCurrentCard()?.audio);
        if (!url) return;
        if (this.audioPlayer) { this.stopAudio(); return; }

        const win = this.contentEl.ownerDocument.defaultView ?? window;
        const audio = new win.Audio(url);
        this.audioPlayer = audio;
        if (this.audioBtn) {
            this.audioBtn.addClass('is-playing');
            setIcon(this.audioBtn, 'pause');
            this.audioBtn.setAttribute('aria-label', '停止播放');
        }
        audio.addEventListener('ended', () => { if (this.audioPlayer === audio) this.stopAudio(); });
        audio.addEventListener('error', () => {
            if (this.audioPlayer !== audio) return;
            this.stopAudio();
            new Notice('音频加载失败');
        });
        void audio.play().catch(() => {
            if (this.audioPlayer !== audio) return;
            this.stopAudio();
            new Notice('无法播放这段音频');
        });
    }

    private showAnswer() {
        if (this.state === 'answer') return;
        this.createControlButtons();
        this.state = 'answer';
        this.showAnswerButton.buttonEl.hide();
        this.controlsContainer.show();

        if (this.isInPlaceImage) {
            this.frontEl.hide();
            this.answerContainer.show();
            this.activeInPlaceView = 'answer';
            this.inplaceIndicatorEl.setText('答案（点击可回看问题）');
            this.inplaceIndicatorEl.show();
        } else {
            this.frontEl.show();
            this.answerContainer.show();
            this.inplaceIndicatorEl.hide();
        }
    }

    private toggleInPlaceView() {
        if (!this.isInPlaceImage || this.state !== 'answer') return;

        if (this.activeInPlaceView === 'answer') {
            this.activeInPlaceView = 'question';
            this.frontEl.show();
            this.answerContainer.hide();
            this.inplaceIndicatorEl.setText('问题（点击查看答案）');
        } else {
            this.activeInPlaceView = 'answer';
            this.frontEl.hide();
            this.answerContainer.show();
            this.inplaceIndicatorEl.setText('答案（点击可回看问题）');
        }
    }

    private buriedStack: Array<{ cardId: string; siblings: Card[] }> = [];

    private handleRating(rating: Rating) {
        const card = this.getCurrentCard();
        this.plugin.dataManager.updateCard(card, rating);
        const data = card.fsrsData;
        if (data && (data.state === State.Learning || data.state === State.Relearning)
            && data.due.getTime() - Date.now() <= LEARN_AHEAD_MS) {
            const at = Math.min(this.queue.length, this.currentCardIndex + 1 + REQUEUE_GAP);
            this.queue.splice(at, 0, card);
        }

        if (this.plugin.settings.burySiblings) {
            const siblings: Card[] = [];
            for (let i = this.queue.length - 1; i > this.currentCardIndex; i--) {
                if (this.plugin.dataManager.areSiblings(card, this.queue[i])) {
                    siblings.push(this.queue[i]);
                    this.queue.splice(i, 1);
                }
            }
            if (siblings.length > 0) {
                this.buriedStack.push({ cardId: card.id, siblings });
            }
        }

        this.currentCardIndex++;
        this.updateUndoButton();
        void this.showNextCard();
    }

    private undoRating() {
        if (this.currentCardIndex === 0 || !this.plugin.dataManager.canUndo()) return;
        const card = this.plugin.dataManager.undoLastRating();
        if (!card) return;
        this.currentCardIndex--;
        const duplicate = this.queue.indexOf(card, this.currentCardIndex + 1);
        if (duplicate > this.currentCardIndex) this.queue.splice(duplicate, 1);

        if (this.buriedStack.length > 0 && this.buriedStack[this.buriedStack.length - 1].cardId === card.id) {
            const entry = this.buriedStack.pop();
            if (entry) {
                this.queue.push(...entry.siblings);
            }
        }

        this.updateUndoButton();
        void this.showNextCard();
    }

    private updateUndoButton() {
        if (!this.undoButton) return;
        const canUndo = this.currentCardIndex > 0 && this.plugin.dataManager.canUndo();
        if (canUndo) {
            this.undoButton.removeClass('fsrs-review-hint-disabled');
        } else {
            this.undoButton.addClass('fsrs-review-hint-disabled');
        }
    }

    private showCompletionScreen() {
        this.contentEl.empty();
        const container = this.contentEl.createDiv({ cls: 'fsrs-completion-screen' });
        container.createEl('h2', { text: '干得漂亮！' });
        const uniqueCards = new Set(this.queue.map((card) => card.id)).size;
        const repeats = this.queue.length - uniqueCards;
        const repeatText = repeats > 0 ? `（含 ${repeats} 次学习重测）` : '';
        container.createEl('p', { text: `你已完成 ${uniqueCards} 张卡片${repeatText}。` });
        new ButtonComponent(container).setButtonText('结束复习').setCta().onClick(() => this.finish());
    }

    private handleKeyPress(evt: KeyboardEvent) {
        if (!this.active) return;
        if (evt.key === 'Escape') {
            this.finish();
            return;
        }

        const typing = evt.target instanceof HTMLInputElement || evt.target instanceof HTMLTextAreaElement;
        if (typing) return;
        if (evt.key.toLowerCase() === 'e' && !evt.shiftKey && !evt.altKey && !evt.ctrlKey && !evt.metaKey) {
            evt.preventDefault();
            void this.openCardSource();
            return;
        }
        if (evt.key.toLowerCase() === 'r' && !evt.shiftKey && !evt.altKey && !evt.ctrlKey && !evt.metaKey) {
            evt.preventDefault();
            void this.refreshCurrentCard();
            return;
        }
        if (evt.key.toLowerCase() === 'a' && !evt.shiftKey && !evt.altKey && !evt.ctrlKey && !evt.metaKey) {
            if (this.getCurrentCard()?.audio) {
                evt.preventDefault();
                this.toggleAudio();
                return;
            }
        }
        if (evt.key.toLowerCase() === 'z' && !evt.shiftKey && !evt.altKey) {
            evt.preventDefault();
            this.undoRating();
            return;
        }

        if (this.state === 'question') {
            if (evt.key === ' ' || evt.key === 'Enter') {
                evt.preventDefault();
                this.showAnswer();
            }
            return;
        }

        if (this.state === 'answer') {
            if (this.isInPlaceImage && (evt.key === ' ' || evt.key === 'Enter' || evt.key === 'p' || evt.key === 'f')) {
                evt.preventDefault();
                this.toggleInPlaceView();
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

    private getCurrentCard(): Card { return this.queue[this.currentCardIndex]; }
}
