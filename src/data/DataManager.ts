import { FSRS, Rating, State, createEmptyCard, type Card as FSRSCard } from 'ts-fsrs';
import { Notice, TFile, type CachedMetadata } from 'obsidian';
import type { Card, Deck, DeckSettings, FSRSData, FSRSParameters, Gamification, NoteReviewData, PluginData, ReviewLog } from './types';
import { isRecord, cyrb53hex, LEGACY_DATABASE_NAME, CHOICE_CARDS_ENABLED, getDocsWritten, getErrorMessage, isLikelyCorsOrNetworkErrorMessage, buildAuthenticatedUrl, sanitizeUrlForDisplay } from './constants';
import { CARD_BLOCK_RE, clozeBack, clozeFront, clozeNumbers, parseCardBlockAttributes, parseCardBlockBody, resolveQuizKind } from './cardText';
import { PouchDBManager } from '../database/PouchDBManager';
import { buildBackup, type BackupContent } from './backup';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class DataManager {
    private plugin: FSRSFlashcardsPlugin;
    private fsrs: FSRS;
    private decks: Map<string, Deck> = new Map();
    private cards: Map<string, Card> = new Map();
    private fsrsDataStore: Record<string, FSRSData> = {};
    private adoptedStateInFile = false;
    private noteReviews: Map<string, NoteReviewData> = new Map();
    private reviewHistory: ReviewLog[] = [];
    private pouchDB: PouchDBManager | null = null;
    private migrationCompleted: boolean = false;
    private isLoaded: boolean = false;
    private fileMtimes: Map<string, number> = new Map();
    private fileCards: Map<string, Set<string>> = new Map();
    private fileDeckPaths: Map<string, string> = new Map();
    private lineStartsCache: { content: string; starts: number[] } | null = null;
    private firstReviewAt: Map<string, number> | null = null;
    private undoStack: Array<{ card: Card; previous: FSRSData | undefined; timestamp: number; gamification: Gamification }> = [];

    constructor(plugin: FSRSFlashcardsPlugin) {
        this.plugin = plugin;
        this.fsrs = new FSRS(plugin.settings.fsrsParams);
        if (plugin.settings.usePouchDB) {
            this.pouchDB = new PouchDBManager(this.databaseName());
        }
    }

    private runInBackground(task: () => Promise<unknown> | undefined, message: string): void {
        void (async () => {
            try {
                await task();
            } catch (error: unknown) {
                console.error(message, error);
            }
        })();
    }

    private databaseName(): string {
        return this.plugin.settings.databaseName || LEGACY_DATABASE_NAME;
    }

    getPouchDB(): PouchDBManager | null {
        return this.pouchDB;
    }

    async initializeSync() {
        if (this.pouchDB) {
            await this.pouchDB.sanitizeSyncMeta();
        }

        if (this.plugin.settings.syncEnabled
            && this.plugin.settings.syncUrl
            && this.pouchDB) {
            try {
                const syncUrl = buildAuthenticatedUrl(
                    this.plugin.settings.syncUrl,
                    this.plugin.settings.syncDbName,
                    this.plugin.settings.syncUsername,
                    this.plugin.settings.syncPassword,
                );
                console.debug('Initializing sync with:', sanitizeUrlForDisplay(syncUrl));

                this.pouchDB.onSyncChange((info) => {
                    const docsWritten = getDocsWritten(info);
                    console.debug('Synced changes:', info);
                    if (docsWritten > 0) {
                        new Notice(`已同步 ${docsWritten} 条变更`, 2000);
                    }
                });

                this.pouchDB.onSyncError((err) => {
                    const message = getErrorMessage(err);
                    console.error('Sync error:', err);
                    new Notice(`同步错误：${message}`, 5000);

                    if (isLikelyCorsOrNetworkErrorMessage(message)) {
                        new Notice('同步已停止。请检查 CORS 设置与同步 URL。', 7000);
                        this.runInBackground(() => this.pouchDB?.stopSync(), 'Failed to stop sync after network/CORS error:');
                    }
                });

                this.pouchDB.onSyncActive(() => {
                    console.debug('Sync active');
                });

                this.pouchDB.onSyncPaused((err) => {
                    if (err) {
                        console.debug('Sync paused with error:', err);
                    }
                });

                await this.pouchDB.setupSync(syncUrl);
                new Notice('同步初始化成功');
            } catch (error) {
                console.error('Failed to initialize sync:', error);
                new Notice(`同步初始化失败：${getErrorMessage(error)}`);
            }
        }
    }

    async stopSync() {
        if (this.pouchDB) {
            await this.pouchDB.stopSync();
        }
    }

    async load() {
        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            await this.loadFromPouchDB();
        } else {
            await this.loadFromLegacyJSON();
        }
        await this.buildIndex();
        this.reconcileGamification();
        void this.save();
        this.isLoaded = true;
    }

    isDataLoaded() {
        return this.isLoaded;
    }

    private async loadFromPouchDB() {
        if (!this.pouchDB) return;

        console.debug('Loading data from PouchDB...');

        this.fsrsDataStore = await this.pouchDB.getAllCardStates();

        this.reviewHistory = (await this.pouchDB.getReviewHistory()).reverse();
        this.firstReviewAt = null;

        console.debug(`Loaded ${Object.keys(this.fsrsDataStore).length} cards and ${this.reviewHistory.length} reviews from PouchDB`);
    }

    private async loadFromLegacyJSON() {
        console.debug('Loading data from legacy JSON...');
        const data = (await this.plugin.loadData()) as PluginData | null;
        const cardData = data?.cardData || {};
        for (const cardId in cardData) {
            const card = cardData[cardId];
            if (card.due) card.due = new Date(card.due);
            if (card.last_review) card.last_review = new Date(card.last_review);
        }
        this.fsrsDataStore = cardData;
        this.reviewHistory = data?.reviewHistory || [];
        this.firstReviewAt = null;
    }

    async save() {
        await this.plugin.saveData({
            settings: this.plugin.settings,
            cardData: this.plugin.settings.usePouchDB ? {} : this.fsrsDataStore,
            reviewHistory: this.plugin.settings.usePouchDB ? [] : this.reviewHistory,
        });
    }

    exportBackup(): string {
        return buildBackup(this.fsrsDataStore, this.reviewHistory, this.plugin.settings.gamification, this.plugin.manifest?.version ?? '');
    }

    async importBackup(content: BackupContent): Promise<{ cards: number; matched: number; reviews: number; skipped: number }> {
        const states: Array<{ cardId: string; deckId: string; filePath: string; fsrs: FSRSData }> = [];
        let matched = 0;
        for (const [cardId, data] of Object.entries(content.cardData)) {
            const existing = this.fsrsDataStore[cardId];
            const incoming = data.last_review?.getTime() ?? 0;
            if (existing && (existing.last_review?.getTime() ?? 0) >= incoming) continue;
            this.fsrsDataStore[cardId] = data;
            const card = this.cards.get(cardId);
            if (card) {
                card.fsrsData = data;
                matched++;
            }
            states.push({ cardId, deckId: card?.deckId ?? '', filePath: card?.filePath ?? '', fsrs: data });
        }

        const known = new Set(this.reviewHistory.map(log => `${log.cardId}|${log.timestamp}`));
        const logs = content.reviewHistory.filter(log => !known.has(`${log.cardId}|${log.timestamp}`));
        if (logs.length > 0) {
            this.reviewHistory = [...this.reviewHistory, ...logs].sort((a, b) => a.timestamp - b.timestamp);
            this.firstReviewAt = null;
        }

        const g = content.gamification;
        if (g && g.totalCardsReviewed > this.plugin.settings.gamification.totalCardsReviewed) {
            Object.assign(this.plugin.settings.gamification, g);
        }

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            await this.pouchDB.importData(states, logs);
        }
        await this.save();
        this.recalculateAllDeckStats();
        return { cards: states.length, matched, reviews: logs.length, skipped: content.skipped };
    }

    updateFsrsParameters(params: FSRSParameters) {
        this.fsrs = new FSRS(params);
    }

    async buildIndex() {
        console.debug('FSRS: Building index...');
        this.decks.clear();
        this.cards.clear();
        this.noteReviews.clear();
        this.fileMtimes.clear();
        this.fileCards.clear();
        this.fileDeckPaths.clear();
        for (const file of this.plugin.app.vault.getMarkdownFiles()) {
            await this.updateFile(file);
        }
        this.recalculateAllDeckStats();
        console.debug(`FSRS: Index complete. Found ${this.decks.size} decks and ${this.cards.size} cards.`);
    }

    getDeckId(tagPath: string): string {
        return cyrb53hex(tagPath);
    }

    /**
     * 返回该文件唯一归属的牌组标签路径（小写，去掉前导 #）。
     * 规则：命中 0 个牌组根标签 → null（不是牌组）；
     * 命中 2 个及以上不同的牌组标签 → null（临时规则：多标签文件整篇不识别）。
     */
    getDeckTagPath(cache: CachedMetadata | null | undefined): string | null {
        if (!cache) return null;
        const frontmatter = isRecord(cache.frontmatter) ? cache.frontmatter : null;
        if (!frontmatter) return null;
        const raw = frontmatter.MGO ?? frontmatter.mgo;
        const value = Array.isArray(raw) ? raw.find((v): v is string => typeof v === 'string') : raw;
        if (typeof value !== 'string') return null;
        const path = value.replace(/^#/, '').trim().toLowerCase();
        return path || null;
    }

    private hasTag(cache: CachedMetadata | null | undefined, tagWithHash: string): boolean {
        if (!cache) return false;
        const normalized = tagWithHash.toLowerCase();
        const bareTag = normalized.startsWith('#') ? normalized.slice(1) : normalized;
        const hashTag = '#' + bareTag;

        const frontmatter = isRecord(cache.frontmatter) ? cache.frontmatter : null;
        if (frontmatter) {
            const fmTags = frontmatter.tags ?? frontmatter.tag;
            if (typeof fmTags === 'string') {
                const trimmed = fmTags.toLowerCase().trim();
                if (trimmed === bareTag || trimmed === hashTag) return true;
                if (trimmed.includes(',')) {
                    const parts = trimmed.split(',');
                    for (let i = 0; i < parts.length; i++) {
                        const p = parts[i].trim();
                        if (p === bareTag || p === hashTag) return true;
                    }
                }
            } else if (Array.isArray(fmTags)) {
                for (let i = 0; i < fmTags.length; i++) {
                    const item: unknown = fmTags[i];
                    if (typeof item === 'string') {
                        const trimmed = item.toLowerCase().trim();
                        if (trimmed === bareTag || trimmed === hashTag) return true;
                    }
                }
            }
        }

        if (cache.tags) {
            for (let i = 0; i < cache.tags.length; i++) {
                const t = cache.tags[i].tag.toLowerCase();
                if (t === hashTag || t === bareTag) return true;
            }
        }

        return false;
    }

    private buildHeadingBreadcrumbs(lines: string[]): (string | undefined)[] {
        const breadcrumbs = new Array<string | undefined>(lines.length);
        const headingStack: string[] = [];
        let inFrontmatter = false;
        let inCodeBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (i === 0 && trimmed === '---') {
                inFrontmatter = true;
                breadcrumbs[i] = undefined;
                continue;
            }
            if (inFrontmatter) {
                if (trimmed === '---') {
                    inFrontmatter = false;
                }
                breadcrumbs[i] = undefined;
                continue;
            }

            if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
                inCodeBlock = !inCodeBlock;
                breadcrumbs[i] = headingStack.length > 0 ? headingStack.join(' > ') : undefined;
                continue;
            }

            if (!inCodeBlock) {
                const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const text = headingMatch[2].trim();
                    while (headingStack.length >= level) {
                        headingStack.pop();
                    }
                    headingStack.push(text);
                }
            }

            breadcrumbs[i] = headingStack.length > 0 ? headingStack.join(' > ') : undefined;
        }

        return breadcrumbs;
    }

    private findCardContext(content: string, breadcrumbs: (string | undefined)[], searchText: string): string | undefined {
        const idx = content.indexOf(searchText);
        if (idx < 0) return undefined;
        if (this.lineStartsCache?.content !== content) {
            const starts = [0];
            for (let i = content.indexOf('\n'); i >= 0; i = content.indexOf('\n', i + 1)) starts.push(i + 1);
            this.lineStartsCache = { content, starts };
        }
        const starts = this.lineStartsCache.starts;
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= idx) lo = mid; else hi = mid - 1;
        }
        return lo < breadcrumbs.length ? breadcrumbs[lo] : undefined;
    }

    async updateFile(file: TFile): Promise<boolean> {
        this.adoptedStateInFile = false;
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        const deckPath = this.getDeckTagPath(cache);
        const reviewTag = '#review';

        const isDeck = deckPath !== null;
        const isReview = this.hasTag(cache, reviewTag);

        const hadCards = this.fileCards.has(file.path);
        const hadReview = this.noteReviews.has(file.path);
        const prevDeckPath = this.fileDeckPaths.get(file.path) ?? null;

        if (!isDeck && !isReview) {
            if (!hadCards && !hadReview) return false;
            if (hadCards) this.removeFileCards(file.path);
            if (hadReview) this.noteReviews.delete(file.path);
            this.fileMtimes.delete(file.path);
            return true;
        }

        const currentMtime = file.stat?.mtime ?? 0;
        const previousMtime = this.fileMtimes.get(file.path);
        if (currentMtime > 0 && previousMtime === currentMtime
            && prevDeckPath === deckPath && hadReview === isReview) {
            return false;
        }

        let stateChanged = false;

        if (isDeck) {
            if (hadCards) this.removeFileCards(file.path);
            const deckId = this.getDeckId(deckPath);
            const frontmatter = isRecord(cache?.frontmatter) ? cache.frontmatter : null;
            const settings = this.parseDeckSettings(frontmatter);

            let deck = this.decks.get(deckId);
            if (!deck) {
                deck = { id: deckId, title: deckPath, tagPath: deckPath, filePath: file.path, cardIds: new Set(), stats: { new: 0, due: 0, learning: 0 }, settings };
                this.decks.set(deckId, deck);
            } else if (settings) {
                deck.settings = settings;
            }

            const content = await this.plugin.app.vault.read(file);

            const scratch: Deck = { id: deckId, title: deckPath, tagPath: deckPath, filePath: file.path, cardIds: new Set(), stats: { new: 0, due: 0, learning: 0 } };
            this.parseMgoCards(content, file.path, deckId, scratch);

            for (const cardId of scratch.cardIds) deck.cardIds.add(cardId);
            this.fileCards.set(file.path, scratch.cardIds);
            this.fileDeckPaths.set(file.path, deckPath);

            if (deck.cardIds.size === 0) this.decks.delete(deckId);
            stateChanged = true;
        } else if (hadCards) {
            this.removeFileCards(file.path);
            stateChanged = true;
        }

        if (isReview) {
            const existing = this.noteReviews.get(file.path);
            this.noteReviews.set(file.path, {
                filePath: file.path,
                fsrsData: existing?.fsrsData || this.fsrsDataStore[`note::${file.path}`],
            });
            if (!hadReview) stateChanged = true;
        } else if (hadReview) {
            this.noteReviews.delete(file.path);
            stateChanged = true;
        }

        if (currentMtime > 0) {
            this.fileMtimes.set(file.path, currentMtime);
        } else {
            this.fileMtimes.delete(file.path);
        }

        if (this.adoptedStateInFile) {
            this.adoptedStateInFile = false;
            if (!this.plugin.settings.usePouchDB) await this.save();
        }

        return stateChanged;
    }

    public isFileDeck(file: TFile): boolean {
        const cache = this.plugin.app.metadataCache.getFileCache(file);
        return this.getDeckTagPath(cache) !== null;
    }

    public async ensureDeckTag(file: TFile): Promise<boolean> {
        if (this.isFileDeck(file)) return false;

        const deckPath = (this.plugin.settings.deckTags[0] ?? 'flashcards').replace(/^#/, '');
        if (this.plugin.app.fileManager?.processFrontMatter) {
            await this.plugin.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                fm.MGO = deckPath;
            });
        }
        new Notice(`已为笔记写入 MGO: ${deckPath}`);
        return true;
    }

    private parseDeckSettings(frontmatter: Record<string, unknown> | null): DeckSettings | undefined {
        if (!frontmatter) return undefined;

        let newCardsPerDay: number | undefined;
        let reviewsPerDay: number | undefined;
        let requestRetention: number | undefined;

        const rawNew = frontmatter.newCardsPerDay ?? frontmatter['new-cards-per-day'] ?? frontmatter.new_cards_per_day ?? frontmatter.newLimit;
        if (typeof rawNew === 'number' && rawNew >= 0) {
            newCardsPerDay = rawNew;
        } else if (typeof rawNew === 'string') {
            const parsed = parseInt(rawNew, 10);
            if (!isNaN(parsed) && parsed >= 0) newCardsPerDay = parsed;
        }

        const rawReviews = frontmatter.reviewsPerDay ?? frontmatter['reviews-per-day'] ?? frontmatter.reviews_per_day ?? frontmatter.reviewLimit;
        if (typeof rawReviews === 'number' && rawReviews >= 0) {
            reviewsPerDay = rawReviews;
        } else if (typeof rawReviews === 'string') {
            const parsed = parseInt(rawReviews, 10);
            if (!isNaN(parsed) && parsed >= 0) reviewsPerDay = parsed;
        }

        const rawRetention = frontmatter.requestRetention ?? frontmatter['request-retention'] ?? frontmatter.request_retention ?? frontmatter.retention ?? frontmatter['fsrs-retention'];
        if (typeof rawRetention === 'number' && rawRetention > 0 && rawRetention < 1) {
            requestRetention = rawRetention;
        } else if (typeof rawRetention === 'string') {
            const parsed = parseFloat(rawRetention);
            if (!isNaN(parsed) && parsed > 0 && parsed < 1) requestRetention = parsed;
        }

        if (newCardsPerDay === undefined && reviewsPerDay === undefined && requestRetention === undefined) {
            return undefined;
        }

        return { newCardsPerDay, reviewsPerDay, requestRetention };
    }

    private getFsrsForCard(card?: Card): FSRS {
        if (!card) return this.fsrs;
        const deck = this.decks.get(card.deckId);
        const retention = deck?.settings?.requestRetention;
        if (retention !== undefined && retention !== this.plugin.settings.fsrsParams.request_retention) {
            return new FSRS({
                ...this.plugin.settings.fsrsParams,
                request_retention: retention,
            });
        }
        return this.fsrs;
    }

    private parseMgoCards(content: string, filePath: string, deckId: string, deck: Deck) {
        const lines = content.split('\n');
        const breadcrumbs = this.buildHeadingBreadcrumbs(lines);
        let match: RegExpExecArray | null;

        // 代码围栏卡片（```mgo / ```mgo-reverse / ```mgo-typein）：块内独立一行 --- 分隔正/背面。
        CARD_BLOCK_RE.lastIndex = 0;
        while ((match = CARD_BLOCK_RE.exec(content)) !== null) {
            const lang = match[1].toLowerCase();
            const rawBody = match[2] || '';
            if (!rawBody.trim()) continue;

            const { attrs, content: cardContent } = parseCardBlockAttributes(rawBody);
            const body = cardContent.trim();
            if (!body) continue;

            const context = this.findCardContext(content, breadcrumbs, match[0]);
            const options = Array.isArray(attrs.options) ? attrs.options : undefined;
            const answer = typeof attrs.answer === 'string' ? attrs.answer : undefined;
            const meta = {
                title: typeof attrs.title === 'string' ? attrs.title : undefined,
                options,
                answer,
                kind: resolveQuizKind(typeof attrs.type === 'string' ? attrs.type : undefined, options, answer) ?? undefined,
                hint: typeof attrs.hint === 'string' ? attrs.hint : undefined,
                audio: typeof attrs.audio === 'string' ? attrs.audio : undefined,
            };
            // 临时开关：选择题卡片暂不登记为闪卡（笔记里仍按普通卡片显示）。
            if (meta.kind === 'choice' && !CHOICE_CARDS_ENABLED) continue;
            const explicitId = typeof attrs.id === 'string' ? attrs.id : '';

            if (clozeNumbers(body).length > 0) {
                const legacyBaseId = cyrb53hex(`block::${filePath}::${body}`);
                const baseId = explicitId ? `${cyrb53hex(filePath)}::${explicitId}` : legacyBaseId;
                this.addClozeCards(body, baseId, legacyBaseId, filePath, deckId, deck, context, body.trim(), meta);
                continue;
            }

            const { front, back } = parseCardBlockBody(body);
            if (!front || !back) continue;

            let finalFront = front;
            let finalBack = back;
            let type: Card['type'] = 'basic';
            if (lang === 'mgo-reverse') { finalFront = back; finalBack = front; type = 'reversed'; }
            else if (lang === 'mgo-typein') { type = 'typein'; }

            const legacyId = cyrb53hex(`block::${filePath}::${front}::${back}`);
            const cardId = explicitId ? `${cyrb53hex(filePath)}::${explicitId}` : legacyId;
            if (explicitId) this.adoptLegacyState(cardId, legacyId, deckId, filePath);
            const card: Card = {
                id: cardId, deckId, filePath, type,
                originalText: match[0], front: finalFront, back: finalBack, context,
                ...meta,
                fsrsData: this.fsrsDataStore[cardId],
            };
            this.cards.set(cardId, card);
            deck.cardIds.add(cardId);
        }
    }

    /** 按挖空编号各生成一张卡片。 */
    private addClozeCards(
        body: string,
        baseId: string,
        legacyBaseId: string,
        filePath: string,
        deckId: string,
        deck: Deck,
        context: string | undefined,
        originalText: string,
        meta: { title?: string; options?: string[]; answer?: string; kind?: 'choice' | 'input'; hint?: string; audio?: string } = {},
    ) {
        for (const clozeNum of clozeNumbers(body)) {
            const cardId = `${baseId}-${clozeNum}`;
            if (baseId !== legacyBaseId) {
                this.adoptLegacyState(cardId, `${legacyBaseId}-${clozeNum}`, deckId, filePath);
            }
            const card: Card = {
                id: cardId, deckId, filePath, type: 'cloze',
                originalText, front: clozeFront(body, clozeNum), back: clozeBack(body), context,
                ...meta,
                fsrsData: this.fsrsDataStore[cardId],
            };
            this.cards.set(cardId, card);
            deck.cardIds.add(cardId);
        }
    }

    /**
     * 旧卡片按块内容指纹存进度；补上 id 后卡片 key 会变。新 key 还没有进度时，
     * 把旧 key 的状态和复习日志认领过来，让「事后补 id」不丢复习进度。
     */
    private adoptLegacyState(newId: string, legacyId: string, deckId: string, filePath: string): void {
        if (newId === legacyId) return;
        const legacy = this.fsrsDataStore[legacyId];
        if (!legacy) return;
        const current = this.fsrsDataStore[newId];
        if (current && current.reps > 0) return;

        this.fsrsDataStore[newId] = legacy;
        delete this.fsrsDataStore[legacyId];
        for (const log of this.reviewHistory) {
            if (log.cardId === legacyId) log.cardId = newId;
        }
        this.firstReviewAt = null;
        this.adoptedStateInFile = true;

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            const db = this.pouchDB;
            this.runInBackground(
                () => db.rekeyCards([{ oldId: legacyId, newId, deckId, filePath }]),
                'Failed to adopt card state:',
            );
        }
    }

    /** 收集牌组自身 + 所有子牌组（tagPath 以 `父/` 开头）的卡片 id。 */
    private deckScopeIds(deck: Deck): Set<string> {
        const ids = new Set<string>();
        const prefix = deck.tagPath + '/';
        for (const d of this.decks.values()) {
            if (d.id === deck.id || d.tagPath.startsWith(prefix)) {
                for (const cid of d.cardIds) ids.add(cid);
            }
        }
        return ids;
    }

    /** 移除某文件贡献的全部卡片（保留 fsrsDataStore 进度，改标签/重建可恢复）。 */
    private removeFileCards(filePath: string) {
        const cardIds = this.fileCards.get(filePath);
        if (!cardIds) return;
        for (const cardId of cardIds) {
            this.cards.delete(cardId);
            for (const deck of this.decks.values()) {
                if (deck.cardIds.delete(cardId) && deck.cardIds.size === 0) {
                    this.decks.delete(deck.id);
                }
            }
        }
        this.fileCards.delete(filePath);
        this.fileDeckPaths.delete(filePath);
    }

    /** 文件被删除时的公开入口。 */
    handleFileDeleted(filePath: string) {
        this.removeFileCards(filePath);
        this.noteReviews.delete(filePath);
        this.fileMtimes.delete(filePath);
        void this.save();
    }

    removeDeck(deckId: string, fullDelete: boolean = true) {
        const deck = this.decks.get(deckId);
        if (!deck) return;
        for (const cardId of deck.cardIds) {
            this.cards.delete(cardId);
            if (fullDelete) delete this.fsrsDataStore[cardId];
        }
        for (const [path, ids] of this.fileCards) {
            if (ids.size && [...ids].some(id => deck.cardIds.has(id))) {
                this.fileCards.delete(path);
                this.fileDeckPaths.delete(path);
            }
        }
        this.decks.delete(deckId);
        if (fullDelete) void this.save();
    }

    private collectCardIds(content: string, filePath: string): string[] {
        const deckId = this.getDeckId(filePath);
        const scratch: Deck = { id: deckId, title: '', tagPath: '', filePath, cardIds: new Set(), stats: { new: 0, due: 0, learning: 0 } };

        const realCards = this.cards;
        this.cards = new Map();
        try {
            this.parseMgoCards(content, filePath, deckId, scratch);
        } finally {
            this.cards = realCards;
        }
        return Array.from(scratch.cardIds);
    }

    private async rekeyRenamedFile(file: TFile, oldPath: string) {
        const renames: Array<{ oldId: string; newId: string; deckId: string; filePath: string }> = [];

        if (this.fileCards.has(oldPath)) {
            const deckPath = this.fileDeckPaths.get(oldPath) ?? '';
            const newDeckId = this.getDeckId(deckPath);
            const content = await this.plugin.app.vault.read(file);
            const oldIds = this.collectCardIds(content, oldPath);
            const newIds = this.collectCardIds(content, file.path);
            oldIds.forEach((oldId, i) => {
                const newId = newIds[i];
                if (!newId || newId === oldId || !this.fsrsDataStore[oldId] || this.fsrsDataStore[newId]) return;
                renames.push({ oldId, newId, deckId: newDeckId, filePath: file.path });
            });
        }

        const oldNoteKey = `note::${oldPath}`;
        const newNoteKey = `note::${file.path}`;
        if (this.noteReviews.delete(oldPath) && this.fsrsDataStore[oldNoteKey] && !this.fsrsDataStore[newNoteKey]) {
            renames.push({ oldId: oldNoteKey, newId: newNoteKey, deckId: '', filePath: file.path });
        }
        if (renames.length === 0) return;

        const idMap = new Map<string, string>();
        for (const { oldId, newId } of renames) {
            this.fsrsDataStore[newId] = this.fsrsDataStore[oldId];
            delete this.fsrsDataStore[oldId];
            idMap.set(oldId, newId);
        }
        for (const log of this.reviewHistory) {
            const newId = idMap.get(log.cardId);
            if (newId) log.cardId = newId;
        }
        this.firstReviewAt = null;

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            await this.pouchDB.rekeyCards(renames);
        }
    }

    async renameDeck(file: TFile, oldPath: string) {
        await this.rekeyRenamedFile(file, oldPath);
        this.removeFileCards(oldPath);
        this.fileMtimes.delete(oldPath);
        await this.updateFile(file);
        await this.save();
    }

    recalculateAllDeckStats() {
        const now = new Date();
        for (const deck of this.decks.values()) {
            deck.stats = { new: 0, due: 0, learning: 0 };
            for (const cardId of this.deckScopeIds(deck)) {
                const card = this.cards.get(cardId);
                if (!card) continue;

                const fsrsData = this.fsrsDataStore[cardId];
                if (!fsrsData || fsrsData.state === State.New) {
                    deck.stats.new++;
                } else {
                    if (fsrsData.state === State.Learning || fsrsData.state === State.Relearning) deck.stats.learning++;
                    if (fsrsData.due <= now) deck.stats.due++;
                }
            }
        }
    }

    getDecks(): Deck[] {
        return Array.from(this.decks.values()).sort((a, b) => a.title.localeCompare(b.title));
    }

    getAllCards(): Card[] {
        return Array.from(this.cards.values());
    }

    getReviewHistory(): ReviewLog[] {
        return this.reviewHistory;
    }

    getCardsByDeck(deckId: string): Card[] {
        const deck = this.decks.get(deckId);
        if (!deck) return [];
        return Array.from(this.deckScopeIds(deck))
            .map(id => this.cards.get(id))
            .filter((card): card is Card => card !== undefined && card !== null);
    }

    /** 只属于该牌组本身的卡片（不含子牌组），用于仪表盘上按标签精确展示。 */
    getOwnCardsByDeck(deckId: string): Card[] {
        const deck = this.decks.get(deckId);
        if (!deck) return [];
        return Array.from(deck.cardIds)
            .map(id => this.cards.get(id))
            .filter((card): card is Card => card !== undefined && card !== null);
    }

    /** 该牌组本身的统计（不含子牌组）。 */
    getOwnDeckStats(deckId: string): { new: number; due: number; learning: number } {
        const now = new Date();
        const stats = { new: 0, due: 0, learning: 0 };
        for (const cardId of this.decks.get(deckId)?.cardIds ?? []) {
            if (!this.cards.get(cardId)) continue;
            const fsrsData = this.fsrsDataStore[cardId];
            if (!fsrsData || fsrsData.state === State.New) {
                stats.new++;
            } else {
                if (fsrsData.state === State.Learning || fsrsData.state === State.Relearning) stats.learning++;
                if (fsrsData.due <= now) stats.due++;
            }
        }
        return stats;
    }

    private getTodayLogs(): ReviewLog[] {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const start = todayStart.getTime();
        let i = this.reviewHistory.length;
        while (i > 0 && this.reviewHistory[i - 1].timestamp >= start) i--;
        return this.reviewHistory.slice(i);
    }

    private getFirstReviewAt(): Map<string, number> {
        if (!this.firstReviewAt) {
            const map = new Map<string, number>();
            for (const log of this.reviewHistory) {
                const seen = map.get(log.cardId);
                if (seen === undefined || log.timestamp < seen) map.set(log.cardId, log.timestamp);
            }
            this.firstReviewAt = map;
        }
        return this.firstReviewAt;
    }

    private getReviewedTodayCount(scopeIds: Set<string>): number {
        let count = 0;
        for (const log of this.getTodayLogs()) {
            if (scopeIds.has(log.cardId)) count++;
        }
        return count;
    }

    areSiblings(cardA: Card, cardB: Card): boolean {
        if (cardA.id === cardB.id) return false;
        if (cardA.filePath !== cardB.filePath) return false;

        if (cardA.originalText && cardB.originalText && cardA.originalText === cardB.originalText) {
            return true;
        }

        if (cardA.id.includes('::') && cardB.id.includes('::')) {
            const baseA = cardA.id.replace(/-\d+$/, '');
            const baseB = cardB.id.replace(/-\d+$/, '');
            if (baseA === baseB) return true;
        }

        return false;
    }

    isLeech(card: Card): boolean {
        const threshold = this.plugin.settings.leechThreshold ?? 8;
        if (threshold <= 0) return false;
        return (card.fsrsData?.lapses ?? 0) >= threshold;
    }

    /** 按标签路径收集其自身 + 所有子牌组的卡片 id（不要求父路径本身是一个 deck）。 */
    private scopeIdsByTagPath(tagPath: string): Set<string> {
        const ids = new Set<string>();
        const prefix = tagPath + '/';
        for (const d of this.decks.values()) {
            if (d.tagPath === tagPath || d.tagPath.startsWith(prefix)) {
                for (const cid of d.cardIds) ids.add(cid);
            }
        }
        return ids;
    }

    /** 子树聚合统计（父含子），供仪表盘文件夹组头显示。 */
    getSubtreeStats(tagPath: string): { new: number; due: number; learning: number; total: number } {
        const now = new Date();
        const stats = { new: 0, due: 0, learning: 0, total: 0 };
        for (const cardId of this.scopeIdsByTagPath(tagPath)) {
            if (!this.cards.get(cardId)) continue;
            stats.total++;
            const fsrsData = this.fsrsDataStore[cardId];
            if (!fsrsData || fsrsData.state === State.New) {
                stats.new++;
            } else {
                if (fsrsData.state === State.Learning || fsrsData.state === State.Relearning) stats.learning++;
                if (fsrsData.due <= now) stats.due++;
            }
        }
        return stats;
    }

    /** 子树复习队列（父含子），用于父牌组节点的"复习"按钮。 */
    getSubtreeQueue(tagPath: string): Card[] {
        return this.composeQueue(this.scopeIdsByTagPath(tagPath), undefined);
    }

    /**
     * 所有牌组合并后的队列（仪表盘「复习全部到期」用）。
     * 父子牌组的范围互相重叠，必须先按卡片 id 去重，每日上限也只扣一次，
     * 否则同一张卡会按「经过几个牌组」重复进入队列。
     */
    getAllDecksQueue(): Card[] {
        const ids = new Set<string>();
        for (const deck of this.decks.values()) {
            for (const id of this.deckScopeIds(deck)) ids.add(id);
        }
        return this.composeQueue(ids);
    }

    private composeQueue(scopeIds: Set<string>, settings?: DeckSettings): Card[] {
        const now = new Date();
        const allCards = Array.from(scopeIds)
            .map(id => this.cards.get(id))
            .filter((card): card is Card => card !== undefined && card !== null);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const firstReviewAt = this.getFirstReviewAt();

        const newIntroducedToday = allCards.filter(c => {
            const first = firstReviewAt.get(c.id);
            return first !== undefined && first >= todayStart.getTime();
        }).length;

        const dueCards = allCards.filter(c =>
            c.fsrsData && c.fsrsData.state !== State.New && c.fsrsData.due <= now
        )
            .sort((a, b) => a.fsrsData!.due.getTime() - b.fsrsData!.due.getTime());

        const newCards = allCards.filter(c =>
            !c.fsrsData || c.fsrsData.state === State.New
        );

        const deckMaxReviews = settings?.reviewsPerDay ?? this.plugin.settings.reviewsPerDay;
        const deckMaxNew = settings?.newCardsPerDay ?? this.plugin.settings.newCardsPerDay;

        const reviewsRemaining = Math.max(0, deckMaxReviews - this.getReviewedTodayCount(scopeIds));
        const newCardsRemaining = Math.max(0, deckMaxNew - newIntroducedToday);

        const candidateCards = [
            ...dueCards.slice(0, reviewsRemaining),
            ...newCards.slice(0, newCardsRemaining),
        ];

        if (!this.plugin.settings.burySiblings) {
            return candidateCards;
        }

        const reviewedTodayLogs = this.getTodayLogs();
        const reviewedTodayCards = reviewedTodayLogs
            .map(l => this.cards.get(l.cardId))
            .filter((c): c is Card => c !== undefined);

        const finalQueue: Card[] = [];
        for (const card of candidateCards) {
            const hasReviewedSibling = reviewedTodayCards.some(s => this.areSiblings(card, s));
            if (hasReviewedSibling) continue;

            const hasQueueSibling = finalQueue.some(q => this.areSiblings(card, q));
            if (hasQueueSibling) continue;

            finalQueue.push(card);
        }

        return finalQueue;
    }

    getReviewQueue(deckId: string): Card[] {
        const deck = this.decks.get(deckId);
        if (!deck) return [];
        return this.composeQueue(this.deckScopeIds(deck), deck.settings);
    }

    getAllCardsForStudy(deckId: string): Card[] {
        const deck = this.decks.get(deckId);
        if (!deck) return [];
        const now = new Date();
        const allCards = Array.from(this.deckScopeIds(deck))
            .map(id => this.cards.get(id))
            .filter((card): card is Card => card !== undefined && card !== null);
        const dueCards = allCards.filter(c =>
            c.fsrsData && c.fsrsData.state !== State.New && c.fsrsData.due <= now
        ).sort((a, b) => a.fsrsData!.due.getTime() - b.fsrsData!.due.getTime());
        const newCards = allCards.filter(c => !c.fsrsData || c.fsrsData.state === State.New);
        return [...dueCards, ...newCards];
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    undoLastRating(): Card | null {
        const entry = this.undoStack.pop();
        if (!entry) return null;
        const { card, previous, timestamp, gamification } = entry;

        let logIndex = -1;
        for (let i = this.reviewHistory.length - 1; i >= 0; i--) {
            if (this.reviewHistory[i].cardId === card.id && this.reviewHistory[i].timestamp === timestamp) {
                logIndex = i;
                break;
            }
        }
        if (logIndex >= 0) this.reviewHistory.splice(logIndex, 1);
        this.firstReviewAt = null;

        if (previous) {
            this.fsrsDataStore[card.id] = previous;
        } else {
            delete this.fsrsDataStore[card.id];
        }
        card.fsrsData = previous;
        const live = this.cards.get(card.id);
        if (live) live.fsrsData = previous;
        Object.assign(this.plugin.settings.gamification, gamification);

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            const db = this.pouchDB;
            this.runInBackground(
                () => previous ? db.saveCardState(card.id, card.deckId, card.filePath, previous) : db.deleteCardState(card.id),
                'Failed to restore card state:',
            );
            this.runInBackground(() => db.deleteReviewLog(card.id, timestamp), 'Failed to remove review log:');
            void this.save();
        } else {
            void this.save();
        }
        this.recalculateAllDeckStats();
        return card;
    }

    updateCard(card: Card, rating: Rating) {
        const now = new Date();
        this.undoStack.push({
            card,
            previous: this.fsrsDataStore[card.id],
            timestamp: now.getTime(),
            gamification: { ...this.plugin.settings.gamification },
        });
        if (this.undoStack.length > 100) this.undoStack.shift();
        const fsrsCard = card.fsrsData || {
            due: now, stability: 0, difficulty: 0, elapsed_days: 0,
            scheduled_days: 0, reps: 0, lapses: 0, state: State.New, learning_steps: 0,
        };
        const fsrs = this.getFsrsForCard(card);
        const schedulingCards = fsrs.repeat(fsrsCard, now);
        const newFsrsData = schedulingCards[rating as Exclude<Rating, Rating.Manual>].card;
        this.fsrsDataStore[card.id] = newFsrsData;
        card.fsrsData = newFsrsData;

        const reviewLog: ReviewLog = { cardId: card.id, timestamp: now.getTime(), rating };
        this.reviewHistory.push(reviewLog);
        if (this.firstReviewAt && !this.firstReviewAt.has(card.id)) this.firstReviewAt.set(card.id, now.getTime());

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            const db = this.pouchDB;
            this.runInBackground(() => db.saveCardState(card.id, card.deckId, card.filePath, newFsrsData), 'Failed to save card state:');
            this.runInBackground(() => db.addReviewLog(card.id, now.getTime(), rating), 'Failed to save review log:');
        } else {
            void this.save();
        }

        this.updateGamification(now, rating, newFsrsData);
        // 每次评分后重算牌组统计：否则仪表盘的「到期/新卡」会一直停在打开插件时的数字。
        this.recalculateAllDeckStats();
        void this.save();
    }

    private toLocalDateString(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private updateGamification(now: Date, rating: Rating, fsrsData: import('ts-fsrs').Card) {
        const g = this.plugin.settings.gamification;
        const today = this.toLocalDateString(now);

        // Streak
        if (g.lastReviewDate) {
            if (g.lastReviewDate !== today) {
                const prev = new Date(g.lastReviewDate + 'T12:00:00').getTime();
                const curr = new Date(today + 'T12:00:00').getTime();
                const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    g.currentStreak++;
                } else if (diffDays > 1) {
                    g.currentStreak = 1;
                }
            }
        } else {
            g.currentStreak = 1;
        }
        g.lastReviewDate = today;
        if (g.currentStreak > g.longestStreak) {
            g.longestStreak = g.currentStreak;
        }

        // XP: base 10 × rating multiplier × interval multiplier
        const ratingMult = rating === Rating.Again ? 1 : rating === Rating.Hard ? 2 : rating === Rating.Good ? 3 : 4;
        const intervalDays = Math.max(fsrsData.scheduled_days || 0, 1);
        const xpGained = Math.round(10 * ratingMult * Math.min(intervalDays / 7, 3));
        g.totalXp += xpGained;

        // Total cards reviewed
        g.totalCardsReviewed++;

        // Most reviews in a day
        const reviewsToday = this.getTodayLogs().length;
        if (reviewsToday > g.mostReviewsInDay) {
            g.mostReviewsInDay = reviewsToday;
        }
    }

    reconcileGamification() {
        if (!this.reviewHistory || this.reviewHistory.length === 0) return;

        const g = this.plugin.settings.gamification;
        g.totalCardsReviewed = Math.max(g.totalCardsReviewed, this.reviewHistory.length);

        const reviewsPerDay: Record<string, number> = {};
        let totalHistoricalXp = 0;

        for (const log of this.reviewHistory) {
            const dateStr = this.toLocalDateString(new Date(log.timestamp));
            reviewsPerDay[dateStr] = (reviewsPerDay[dateStr] || 0) + 1;

            const ratingMult = log.rating === Rating.Again ? 1 : log.rating === Rating.Hard ? 2 : log.rating === Rating.Good ? 3 : 4;
            totalHistoricalXp += Math.round(10 * ratingMult);
        }

        if (g.totalXp === 0 && this.reviewHistory.length > 0) {
            g.totalXp = totalHistoricalXp;
        }

        let maxReviewsInDay = g.mostReviewsInDay;
        for (const count of Object.values(reviewsPerDay)) {
            if (count > maxReviewsInDay) maxReviewsInDay = count;
        }
        g.mostReviewsInDay = maxReviewsInDay;

        const uniqueDates = Object.keys(reviewsPerDay).sort();
        if (uniqueDates.length === 0) return;

        const dayDiff = (d1: string, d2: string): number => {
            const ms1 = new Date(d1 + 'T12:00:00').getTime();
            const ms2 = new Date(d2 + 'T12:00:00').getTime();
            return Math.round((ms2 - ms1) / (1000 * 60 * 60 * 24));
        };

        // Longest streak
        let longest = 1;
        let chain = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
            if (dayDiff(uniqueDates[i - 1], uniqueDates[i]) === 1) {
                chain++;
                if (chain > longest) longest = chain;
            } else {
                chain = 1;
            }
        }
        if (longest > g.longestStreak) g.longestStreak = longest;

        // Current streak
        const now = new Date();
        const todayStr = this.toLocalDateString(now);
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = this.toLocalDateString(yesterday);

        const lastReviewDate = uniqueDates[uniqueDates.length - 1];
        g.lastReviewDate = lastReviewDate;

        if (lastReviewDate !== todayStr && lastReviewDate !== yesterdayStr) {
            g.currentStreak = 0;
        } else {
            let currentStreak = 1;
            for (let i = uniqueDates.length - 1; i > 0; i--) {
                if (dayDiff(uniqueDates[i - 1], uniqueDates[i]) === 1) {
                    currentStreak++;
                } else {
                    break;
                }
            }
            g.currentStreak = Math.max(g.currentStreak, currentStreak);
        }

        if (g.currentStreak > g.longestStreak) g.longestStreak = g.currentStreak;
    }

    getGamificationStats(): Gamification {
        return { ...this.plugin.settings.gamification };
    }

    getNextReviewIntervals(card: Card): Record<number, string> {
        const now = new Date();
        const fsrsCard = card.fsrsData || {
            due: now, stability: 0, difficulty: 0, elapsed_days: 0,
            scheduled_days: 0, reps: 0, lapses: 0, state: State.New, learning_steps: 0,
        };
        const fsrs = this.getFsrsForCard(card);
        const schedulingCards = fsrs.repeat(fsrsCard, now);
        const formatInterval = (days: number): string => {
            if (days < 1) return '<1天';
            if (days < 30) return `${Math.round(days)}天`;
            if (days < 365) return `${(days / 30).toFixed(1)}个月`;
            return `${(days / 365).toFixed(1)}年`;
        };
        return {
            [Rating.Again]: formatInterval(schedulingCards[Rating.Again].card.scheduled_days),
            [Rating.Hard]: formatInterval(schedulingCards[Rating.Hard].card.scheduled_days),
            [Rating.Good]: formatInterval(schedulingCards[Rating.Good].card.scheduled_days),
            [Rating.Easy]: formatInterval(schedulingCards[Rating.Easy].card.scheduled_days),
        };
    }

    getStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const reviewsToday = this.reviewHistory.filter((log) => log.timestamp >= todayStart);
        const activity: number[] = Array.from({ length: 30 }, () => 0);

        this.reviewHistory.forEach((log) => {
            const daysAgo = Math.floor((now.getTime() - log.timestamp) / (1000 * 60 * 60 * 24));
            if (daysAgo < 30) {
                activity[29 - daysAgo]++;
            }
        });

        const forecast: number[] = Array.from({ length: 7 }, () => 0);
        let mature = 0;
        let learning = 0;
        let young = 0;
        let total = 0;

        for (const card of this.cards.values()) {
            const data = this.fsrsDataStore[card.id];
            if (!data) {
                continue;
            }

            total++;

            const dueDay = new Date(data.due.getFullYear(), data.due.getMonth(), data.due.getDate()).getTime();
            const daysForward = Math.max(0, Math.round((dueDay - todayStart) / (1000 * 60 * 60 * 24)));
            if (daysForward < 7) {
                forecast[daysForward]++;
            }

            if (data.stability >= 21) {
                mature++;
            } else if (data.state === State.Review) {
                young++;
            } else {
                learning++;
            }
        }

        return {
            reviewsToday: reviewsToday.length,
            activity,
            forecast,
            maturity: {
                mature,
                young,
                learning,
                new: this.cards.size - total,
            },
        };
    }

    getDetailedStats(): {
        reviewsToday: number;
        activity: number[];
        forecast: number[];
        maturity: { mature: number; young: number; learning: number; new: number };
        retentionCurve: { date: string; predicted: number; actual: number }[];
        heatmapData: { date: string; count: number }[];
        intervalBuckets: { label: string; count: number }[];
        perDeckStats: { name: string; new: number; due: number; learning: number }[];
    } {
        const base = this.getStats();
        const now = new Date();

        // Retention curve: replay review sequences to compute predicted R vs actual recall
        const dailyBuckets = new Map<string, { predictedSum: number; actualSum: number; count: number }>();
        const byCard = new Map<string, { timestamp: number; rating: Rating }[]>();
        for (const log of this.reviewHistory) {
            if (!byCard.has(log.cardId)) byCard.set(log.cardId, []);
            byCard.get(log.cardId)!.push({ timestamp: log.timestamp, rating: log.rating });
        }

        for (const reviews of byCard.values()) {
            reviews.sort((a, b) => a.timestamp - b.timestamp);
            let state: import('ts-fsrs').Card | null = null;

            for (let i = 0; i < reviews.length; i++) {
                const review = reviews[i];
                const dateKey = new Date(review.timestamp).toISOString().slice(0, 10);

                if (!dailyBuckets.has(dateKey)) {
                    dailyBuckets.set(dateKey, { predictedSum: 0, actualSum: 0, count: 0 });
                }
                const bucket = dailyBuckets.get(dateKey)!;

                if (state && i > 0) {
                    const elapsedDays = (review.timestamp - reviews[i - 1].timestamp) / (1000 * 60 * 60 * 24);
                    const stability = state.stability;
                    const predictedR = Math.pow(1 + (Math.pow(0.9, 1 / -0.5) - 1) * Math.max(elapsedDays, 0) / Math.max(stability, 0.01), -0.5);
                    bucket.predictedSum += predictedR;
                } else {
                    bucket.predictedSum += 1;
                }

                const repeatCard: FSRSCard = state ?? createEmptyCard(new Date(review.timestamp));
                const schedulingCards = this.fsrs.repeat(repeatCard, new Date(review.timestamp));
                const rating = review.rating as Exclude<Rating, Rating.Manual>;
                state = schedulingCards[rating].card;

                const actualR = review.rating >= Rating.Good ? 1 : 0;
                bucket.actualSum += actualR;
                bucket.count++;
            }
        }

        const retentionCurve: { date: string; predicted: number; actual: number }[] = [];
        const sortedDates = [...dailyBuckets.keys()].sort().slice(-60);
        for (const date of sortedDates) {
            const b = dailyBuckets.get(date)!;
            retentionCurve.push({
                date,
                predicted: +(b.predictedSum / b.count).toFixed(3),
                actual: +(b.actualSum / b.count).toFixed(3),
            });
        }

        // Heatmap data: last 365 days
        const heatmapData: { date: string; count: number }[] = [];
        const dayCounts = new Map<string, number>();
        for (const log of this.reviewHistory) {
            const date = new Date(log.timestamp).toISOString().slice(0, 10);
            dayCounts.set(date, (dayCounts.get(date) || 0) + 1);
        }
        for (let i = 364; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const date = d.toISOString().slice(0, 10);
            heatmapData.push({ date, count: dayCounts.get(date) || 0 });
        }

        // Interval distribution
        const intervalDeltas: number[] = [];
        for (const reviews of byCard.values()) {
            reviews.sort((a, b) => a.timestamp - b.timestamp);
            for (let i = 1; i < reviews.length; i++) {
                const deltaDays = (reviews[i].timestamp - reviews[i - 1].timestamp) / (1000 * 60 * 60 * 24);
                intervalDeltas.push(deltaDays);
            }
        }

        const buckets = [
            { max: 1, label: '<1天' },
            { max: 2, label: '1天' },
            { max: 3, label: '2天' },
            { max: 4, label: '3天' },
            { max: 7, label: '4-6天' },
            { max: 14, label: '1-2周' },
            { max: 30, label: '2-4周' },
            { max: Infinity, label: '>30天' },
        ];
        const intervalBuckets = buckets.map(b => ({ label: b.label, count: 0 }));
        for (const d of intervalDeltas) {
            for (let i = 0; i < buckets.length; i++) {
                if (d < buckets[i].max) {
                    intervalBuckets[i].count++;
                    break;
                }
            }
        }

        // Per-deck stats
        const perDeckStats = this.getDecks().map(d => ({
            name: d.title,
            new: d.stats.new,
            due: d.stats.due,
            learning: d.stats.learning,
        }));

        return {
            ...base,
            retentionCurve,
            heatmapData,
            intervalBuckets,
            perDeckStats,
        };
    }

    async resetAllProgress(): Promise<void> {
        console.debug('Nuclear option: Resetting all card progress...');

        this.fsrsDataStore = {};
        this.reviewHistory = [];
        this.firstReviewAt = null;

        for (const card of this.cards.values()) {
            card.fsrsData = undefined;
        }

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            console.debug('Clearing PouchDB card states and review logs...');
            await this.pouchDB.destroy();
            const { PouchDBManager } = await import('../database/PouchDBManager');
            this.pouchDB = new PouchDBManager(this.databaseName());
            if (this.plugin.settings.syncEnabled) {
                await this.initializeSync();
            }
        }

        await this.save();

        this.recalculateAllDeckStats();

        console.debug('All progress has been reset');
    }

    getDueNotes(): NoteReviewData[] {
        const now = new Date();
        return Array.from(this.noteReviews.values())
            .filter(n => {
                const data = n.fsrsData;
                return !data || data.state === State.New || data.due <= now;
            })
            .sort((a, b) => {
                const aDue = a.fsrsData?.due?.getTime() ?? 0;
                const bDue = b.fsrsData?.due?.getTime() ?? 0;
                return aDue - bDue;
            });
    }

    getAllReviewNotes(): NoteReviewData[] {
        return Array.from(this.noteReviews.values());
    }

    rateNote(filePath: string, rating: Rating) {
        const now = new Date();
        const existing = this.noteReviews.get(filePath);
        const fsrsCard = existing?.fsrsData || {
            due: now, stability: 0, difficulty: 0, elapsed_days: 0,
            scheduled_days: 0, reps: 0, lapses: 0, state: State.New, learning_steps: 0,
        };
        const schedulingCards = this.fsrs.repeat(fsrsCard, now);
        const newFsrsData = schedulingCards[rating as Exclude<Rating, Rating.Manual>].card;

        const noteKey = `note::${filePath}`;
        this.fsrsDataStore[noteKey] = newFsrsData;
        this.noteReviews.set(filePath, { filePath, fsrsData: newFsrsData });

        const reviewLog: ReviewLog = { cardId: noteKey, timestamp: now.getTime(), rating };
        this.reviewHistory.push(reviewLog);

        if (this.plugin.settings.usePouchDB && this.pouchDB) {
            const db = this.pouchDB;
            this.runInBackground(() => db.saveCardState(noteKey, '', filePath, newFsrsData), 'Failed to save note review state:');
            this.runInBackground(() => db.addReviewLog(noteKey, now.getTime(), rating), 'Failed to save note review log:');
        } else {
            void this.save();
        }

        this.updateGamification(now, rating, newFsrsData);
        void this.save();
    }
}
