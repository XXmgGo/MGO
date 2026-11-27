import { ItemView, WorkspaceLeaf, ButtonComponent, Notice, setIcon } from 'obsidian';
import { VIEW_TYPE_DASHBOARD, VIEW_ICON_NAME, getErrorMessage } from '../data/constants';
import type { Card, Deck } from '../data/types';
import { StatsModal } from './StatsModal';
import { CustomStudyModal } from './CustomStudyModal';
import { HelpModal } from './HelpModal';
import { CreateCardModal } from './CreateCardModal';
import { CreateDeckModal } from './CreateDeckModal';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class DashboardView extends ItemView {
    private plugin: FSRSFlashcardsPlugin;
    /** 展开文件夹时才渲染的卡片列表（大牌组避免一次性建太多 DOM）。 */
    private pendingCardLists = new Map<HTMLElement, () => void>();
    /** 记住展开过的文件夹，重渲染（切回标签页）后保持原样。 */
    private expandedPaths = new Set<string>();
    constructor(leaf: WorkspaceLeaf, plugin: FSRSFlashcardsPlugin) {
        super(leaf);
        this.plugin = plugin;
    }
    getViewType(): string { return VIEW_TYPE_DASHBOARD; }
    getDisplayText(): string { return 'MGO 牌组'; }
    getIcon(): string { return VIEW_ICON_NAME; }
    async onOpen() {
        // 复习/浏览标签页评分后统计会变，切回仪表盘时重绘一次。
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            if (leaf === this.leaf) this.render();
        }));
        this.render();
    }

    render() {
        this.contentEl.empty();

        if (!this.plugin.dataManager.isDataLoaded()) {
            this.renderLoading();
            return;
        }

        // 顶部汇总用缓存统计、文件夹行用实时计算，不在此重算两边会对不上；
        // 每次渲染都按「此刻」重算一次，保证到期/新卡是同一时刻的数字。
        this.plugin.dataManager.recalculateAllDeckStats();
        this.renderHeader();
        this.renderDecks();
    }

    private renderLoading() {
        const container = this.contentEl.createDiv({ cls: 'fsrs-empty-state' });
        container.createEl('h2', { text: '正在加载牌组……' });
        container.createEl('p', { text: '正在扫描你的仓库，请稍候。' });
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
        titleSection.createEl('h2', { text: 'MGO', cls: 'fsrs-title' });

        const actionsRow = headerEl.createDiv({ cls: 'fsrs-quick-actions' });

        const createDashBtn = (icon: string, text: string, onClick: () => void, isPrimary = false) => {
            const btn = new ButtonComponent(actionsRow)
                .setIcon(icon)
                .onClick(onClick);
            btn.buttonEl.createSpan({ text });
            if (isPrimary) btn.setCta();
            return btn;
        };

        const studyAllBtn = createDashBtn('play', '复习全部到期', () => {
            const allDueCards = this.plugin.dataManager.getAllDecksQueue();
            if (allDueCards.length === 0) {
                const limited = this.plugin.dataManager.getDecks().some((d: Deck) => d.stats.new > 0 || d.stats.due > 0);
                new Notice(limited
                    ? '已达每日上限，可对某个牌组使用突击模式继续学习。'
                    : '没有到期待复习的卡片！');
                return;
            }
            void this.plugin.openReviewSession(allDueCards);
        }, true);
        const dueCount = this.plugin.dataManager.getDecks().reduce((acc: number, d: Deck) => acc + d.stats.due, 0);
        if (dueCount > 0) {
            studyAllBtn.buttonEl.createSpan({ text: dueCount.toString(), cls: 'fsrs-action-badge' });
        }

        createDashBtn('folder-plus', '新建牌组', () => new CreateDeckModal(this.app, this.plugin).open());
        createDashBtn('plus', '新建卡片', () => new CreateCardModal(this.app, this.plugin).open());
        createDashBtn('bar-chart-2', '统计', () => new StatsModal(this.app, this.plugin).open());
        createDashBtn('filter', '自定义学习', () => new CustomStudyModal(this.app, this.plugin).open());

        const iconRow = actionsRow.createDiv({ cls: 'fsrs-icon-row' });

        const helpBtn = iconRow.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': '帮助与指南' } });
        setIcon(helpBtn, 'help-circle');
        helpBtn.addEventListener('click', () => new HelpModal(this.app, this.plugin).open());

        const refreshBtn = iconRow.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': '刷新' } });
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
            const syncBtn = iconRow.createDiv({ cls: 'clickable-icon', attr: { 'aria-label': '同步' } });
            setIcon(syncBtn, 'cloud');
            syncBtn.addEventListener('click', () => {
                void (async () => {
                    if (pouchDB.isSyncing()) {
                        new Notice('正在同步……');
                        return;
                    }
                    syncBtn.addClass('is-busy');
                    try {
                        const syncTimeout = new Promise<never>((_, reject) => {
                            window.setTimeout(() => reject(new Error('同步请求超时')), 15000);
                        });
                        await Promise.race([pouchDB.manualSync(), syncTimeout]);
                        new Notice('同步完成！', 3000);
                    } catch (error: unknown) {
                        new Notice(`同步失败：${getErrorMessage(error)}`, 5000);
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

        createStatPill('layers', globalStats.total.toString(), '总数', 'neutral');
        createStatPill('clock', globalStats.due.toString(), '到期', 'due');
        createStatPill('sparkles', globalStats.new.toString(), '新卡', 'new');

        // Gamification widget
        const gamification = this.plugin.dataManager.getGamificationStats();
        const gamificationEl = headerEl.createDiv({ cls: 'fsrs-gamification' });

        const streakEl = gamificationEl.createDiv({ cls: 'fsrs-gamification-item' });
        setIcon(streakEl.createSpan({ cls: 'fsrs-gamification-icon' }), 'flame');
        const streakValue = streakEl.createSpan({ cls: 'fsrs-gamification-value' });
        streakValue.setText(gamification.currentStreak.toString());
        streakEl.createSpan({ cls: 'fsrs-gamification-label', text: '连续天数' });

        const xpEl = gamificationEl.createDiv({ cls: 'fsrs-gamification-item' });
        setIcon(xpEl.createSpan({ cls: 'fsrs-gamification-icon' }), 'star');
        xpEl.createSpan({ cls: 'fsrs-gamification-value', text: gamification.totalXp.toString() });
        xpEl.createSpan({ cls: 'fsrs-gamification-label', text: '经验值' });

        const bestEl = gamificationEl.createDiv({ cls: 'fsrs-gamification-item' });
        setIcon(bestEl.createSpan({ cls: 'fsrs-gamification-icon' }), 'trophy');
        bestEl.createSpan({ cls: 'fsrs-gamification-value', text: gamification.longestStreak.toString() });
        bestEl.createSpan({ cls: 'fsrs-gamification-label', text: '最长连续天数' });
    }

    private renderDecks() {
        const decks = this.plugin.dataManager.getDecks();
        this.pendingCardLists.clear();
        if (decks.length === 0) { this.renderEmptyState(); return; }

        // 收集所有节点路径（牌组本身 + 其全部祖先前缀）
        const deckByPath = new Map<string, Deck>();
        const nodePaths = new Set<string>();
        for (const deck of decks) {
            deckByPath.set(deck.tagPath, deck);
            const segs = deck.tagPath.split('/');
            for (let i = 1; i <= segs.length; i++) {
                nodePaths.add(segs.slice(0, i).join('/'));
            }
        }

        // 根节点 = 不含 '/' 的路径
        const roots = [...nodePaths].filter(p => !p.includes('/')).sort((a, b) => a.localeCompare(b));
        for (const root of roots) {
            this.renderTagNode(root, deckByPath, nodePaths, this.contentEl);
        }
    }

    /** 某节点下的直接子路径（再深一级、无额外斜杠）。 */
    private childPaths(parent: string, nodePaths: Set<string>): string[] {
        const prefix = parent + '/';
        const children: string[] = [];
        for (const p of nodePaths) {
            if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) children.push(p);
        }
        return children.sort((a, b) => a.localeCompare(b));
    }

    private renderTagNode(path: string, deckByPath: Map<string, Deck>, nodePaths: Set<string>, parentEl: HTMLElement) {
        const folderContainer = parentEl.createDiv({ cls: 'fsrs-folder-group' });
        const folderHeader = folderContainer.createDiv({ cls: 'fsrs-folder-header' });
        folderHeader.setAttribute('role', 'button');
        folderHeader.setAttribute('tabindex', '0');
        folderHeader.setAttribute('aria-expanded', 'false');

        const chevronIcon = folderHeader.createDiv({ cls: 'fsrs-folder-chevron' });
        const folderIcon = folderHeader.createDiv({ cls: 'fsrs-folder-icon' });
        setIcon(chevronIcon, 'chevron-right');
        setIcon(folderIcon, 'folder-closed');

        const lastSegment = path.substring(path.lastIndexOf('/') + 1);
        folderHeader.createSpan({ text: lastSegment, cls: 'fsrs-folder-name' });

        const deck = deckByPath.get(path);
        if (deck) this.renderDeckActions(folderHeader, deck);

        const counts = deck
            ? this.plugin.dataManager.getOwnDeckStats(deck.id)
            : this.plugin.dataManager.getSubtreeStats(path);
        const countContainer = folderHeader.createDiv({ cls: 'fsrs-folder-count-container' });
        if (counts.due > 0) {
            countContainer.createSpan({ text: `${counts.due}`, cls: 'fsrs-folder-count fsrs-folder-due-count' });
        }
        if (counts.new > 0) {
            countContainer.createSpan({ text: `${counts.new}`, cls: 'fsrs-folder-count' });
        }

        const decksContainer = folderContainer.createDiv({ cls: 'fsrs-folder-decks' });
        decksContainer.hide();

        let isCollapsed = !this.expandedPaths.has(path);
        folderHeader.addClass(isCollapsed ? 'is-collapsed' : 'is-expanded');
        folderHeader.setAttribute('aria-expanded', (!isCollapsed).toString());

        const toggleFolder = () => {
            isCollapsed = !isCollapsed;
            if (isCollapsed) this.expandedPaths.delete(path); else this.expandedPaths.add(path);
            folderHeader.toggleClass('is-collapsed', isCollapsed);
            folderHeader.toggleClass('is-expanded', !isCollapsed);
            folderHeader.setAttribute('aria-expanded', (!isCollapsed).toString());
            if (isCollapsed) { decksContainer.hide(); } else { decksContainer.show(); this.flushCardLists(decksContainer); }
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

        // 本节点若本身是牌组：卡片列表直接挂在文件夹下，文件夹行就是牌组行
        if (deck) {
            const deckCardsEl = decksContainer.createDiv({ cls: 'fsrs-deck-cards' });
            this.pendingCardLists.set(deckCardsEl, () => this.renderCardRows(deckCardsEl, deck));
        }

        // 递归渲染子节点（挂进本节点的展开容器内）
        for (const child of this.childPaths(path, nodePaths)) {
            this.renderTagNode(child, deckByPath, nodePaths, decksContainer);
        }

        // 上次是展开状态：恢复图标与子内容
        if (!isCollapsed) {
            decksContainer.show();
            setIcon(chevronIcon, 'chevron-down');
            setIcon(folderIcon, 'folder-open');
            this.flushCardLists(decksContainer);
        }
    }

    /** 文件夹行右侧的牌组操作：复习 / 突击 / 浏览。 */
    private renderDeckActions(header: HTMLElement, deck: Deck) {
        const hasDue = deck.stats.due > 0;
        const actionsEl = header.createDiv({ cls: 'fsrs-folder-actions' });

        const studyBtn = actionsEl.createEl('button', {
            cls: `clickable-icon${hasDue ? '' : ' fsrs-deck-muted'}`,
            attr: { 'aria-label': hasDue ? `复习 ${deck.stats.due} 张卡片` : '没有到期卡片' },
        });
        setIcon(studyBtn, 'play');
        studyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const queue = this.plugin.dataManager.getReviewQueue(deck.id);
            if (queue.length === 0) {
                new Notice(deck.stats.new > 0 || deck.stats.due > 0
                    ? '该牌组已达每日上限，可使用突击模式继续学习。'
                    : '该牌组没有可复习的卡片！');
                return;
            }
            void this.plugin.openReviewSession(queue, deck.title);
        });

        const cramBtn = actionsEl.createEl('button', {
            cls: 'clickable-icon',
            attr: { 'aria-label': '突击全部卡片' },
        });
        setIcon(cramBtn, 'zap');
        cramBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cards = this.plugin.dataManager.getAllCardsForStudy(deck.id);
            if (cards.length === 0) {
                new Notice('该牌组没有卡片！');
                return;
            }
            void this.plugin.openReviewSession(cards, deck.title);
        });

        const browseBtn = actionsEl.createEl('button', {
            cls: 'clickable-icon',
            attr: { 'aria-label': '浏览卡片' },
        });
        setIcon(browseBtn, 'list');
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cards = this.plugin.dataManager.getOwnCardsByDeck(deck.id);
            if (cards.length === 0) {
                new Notice('该牌组没有可浏览的卡片。');
                return;
            }
            void this.plugin.openBrowseSession(cards, deck.title);
        });
    }

    /** 文件夹展开时，把其下所有待填充的卡片列表一次性建好。 */
    private flushCardLists(root: HTMLElement) {
        for (const [el, render] of Array.from(this.pendingCardLists)) {
            if (!root.contains(el)) continue;
            this.pendingCardLists.delete(el);
            render();
        }
    }

    /** 文件夹下直接列出的卡片：只属于该标签本身的卡片（不含子标签）。 */
    private renderCardRows(container: HTMLElement, deck: Deck) {
        const cards = this.plugin.dataManager.getOwnCardsByDeck(deck.id);
        if (cards.length === 0) {
            container.createDiv({ cls: 'fsrs-card-row fsrs-card-row-empty', text: '（没有卡片）' });
            return;
        }
        cards.forEach((card: Card, index: number) => {
            const row = container.createDiv({ cls: 'fsrs-card-row' });
            const iconEl = row.createDiv({ cls: 'fsrs-card-row-icon' });
            const due = card.fsrsData ? card.fsrsData.due.getTime() <= Date.now() : false;
            setIcon(iconEl, due ? 'file-clock' : 'file-text');
            if (due) iconEl.addClass('has-due');

            const label = card.title?.trim() || card.front.trim() || '未命名卡片';
            row.createSpan({ text: label, cls: 'fsrs-card-row-title' });
            row.setAttribute('title', card.filePath);

            row.addEventListener('click', () => {
                void this.plugin.openBrowseSession(cards, deck.tagPath, index);
            });
        });
    }

    private renderEmptyState() {
        const emptyStateEl = this.contentEl.createDiv({ cls: 'fsrs-empty-state' });

        const iconContainer = emptyStateEl.createDiv({ cls: 'fsrs-empty-icon-container' });
        const iconEl = iconContainer.createDiv({ cls: 'fsrs-empty-icon' });
        setIcon(iconEl, 'sparkles');

        emptyStateEl.createEl('h3', { text: '准备好开始学习了吗？', cls: 'fsrs-empty-title' });

        emptyStateEl.createEl('p', {
            text: '在笔记的 frontmatter 里写 MGO（例如 MGO: 日本語/例文）即可创建牌组，也可以直接在下方开始。',
            cls: 'fsrs-empty-desc',
        });

        const emptyActions = emptyStateEl.createDiv({ cls: 'fsrs-empty-actions' });
        new ButtonComponent(emptyActions)
            .setIcon('folder-plus')
            .setButtonText('新建牌组')
            .setCta()
            .onClick(() => new CreateDeckModal(this.app, this.plugin).open());

        new ButtonComponent(emptyActions)
            .setIcon('plus')
            .setButtonText('新建闪卡')
            .onClick(() => new CreateCardModal(this.app, this.plugin).open());

        const tipEl = emptyStateEl.createDiv({ cls: 'fsrs-empty-tip' });
        const tipIcon = tipEl.createDiv({ cls: 'fsrs-tip-icon' });
        setIcon(tipIcon, 'lightbulb');
        tipEl.createSpan({ text: '小技巧：在任意带牌组标签的笔记里写一个 ```mgo 代码块（问题、一行 ---、答案），即可立刻添加卡片。' });
    }
}
