import { Editor, Notice, Plugin, TFile, addIcon, debounce, setIcon } from 'obsidian';
import { DataManager } from '../data/DataManager';
import { VIEW_TYPE_DASHBOARD, VIEW_ICON_NAME, STATUS_ICON_NAME, DEFAULT_SETTINGS, generateBlockId, resolveDatabaseName, getErrorMessage, getDocCount, MGO_ICON_ID, MGO_ICON_SVG, sanitizeUrlForDisplay } from '../data/constants';
import type { FSRSSettings, PluginData } from '../data/types';
import { DashboardView } from '../ui/DashboardView';
import { FSRSSettingsTab } from '../ui/FSRSSettingsTab';
import { ResetProgressModal } from '../ui/ResetProgressModal';
import { CreateCardModal } from '../ui/CreateCardModal';
import { CreateDeckModal } from '../ui/CreateDeckModal';
import { ImportBackupModal } from '../ui/ImportBackupModal';
import { ImportCardsModal } from '../ui/ImportCardsModal';

class FSRSFlashcardsPlugin extends Plugin {
    settings: FSRSSettings;
    dataManager: DataManager;
    private databaseNameIsNew = false;

    async onload() {
        addIcon(MGO_ICON_ID, MGO_ICON_SVG);
        await this.loadSettings();
        this.dataManager = new DataManager(this);

        this.app.workspace.onLayoutReady(async () => {
            await this.dataManager.load();
            if (this.databaseNameIsNew) await this.saveSettings();

            await this.dataManager.initializeSync();

            this.refreshDashboardView();
        });

        this.addSettingTab(new FSRSSettingsTab(this.app, this));
        this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

        const ribbonIconEl = this.addRibbonIcon(VIEW_ICON_NAME, '打开 MGO 仪表盘', (evt: MouseEvent) => {
            void this.activateView();
        });
        ribbonIconEl.addClass('mgo-ribbon-icon');

        const statusButton = this.addStatusBarItem();
        statusButton.addClass('mgo-status-button');
        statusButton.setAttribute('aria-label', '打开 MGO 仪表盘');
        statusButton.setAttribute('title', '打开 MGO 仪表盘');
        const statusIcon = statusButton.createSpan({ cls: 'mgo-status-icon' });
        setIcon(statusIcon, STATUS_ICON_NAME);
        statusButton.createSpan({ text: 'MGO', cls: 'mgo-status-label' });
        statusButton.addEventListener('click', () => {
            void this.activateView();
        });
        this.addCommand({
            id: 'create-card-modal',
            name: '创建闪卡（引导弹窗）',
            callback: () => {
                new CreateCardModal(this.app, this).open();
            },
        });
        this.addCommand({
            id: 'create-deck',
            name: '新建牌组',
            callback: () => {
                new CreateDeckModal(this.app, this).open();
            },
        });
        this.addCommand({
            id: 'tag-note-as-deck',
            name: '将当前笔记标记为闪卡牌组',
            checkCallback: (checking: boolean) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) return false;
                if (!checking) {
                    void this.dataManager.ensureDeckTag(activeFile);
                }
                return true;
            },
        });
        this.addCommand({
            id: 'add-fsrs-flashcard',
            name: '新建闪卡',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const blockId = generateBlockId();
                const template = `\n\n<mgo-card cardId="${blockId}">\n<mgo-card-front>Question</mgo-card-front>\n<mgo-card-back>Answer</mgo-card-back>\n</mgo-card>\n\n`;
                const cursor = editor.getCursor();
                editor.replaceRange(template, cursor);
                editor.setCursor({ line: cursor.line + 4, ch: 8 });
            },
        });
        this.addCommand({
            id: 'add-single-line-card',
            name: '新建单行卡',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const blockId = generateBlockId();
                const template = `\n<mgo-card cardId="${blockId}">\n<mgo-card-front>Question</mgo-card-front>\n<mgo-card-back>Answer</mgo-card-back>\n</mgo-card>\n`;
                const cursor = editor.getCursor();
                editor.replaceRange(template, cursor);
                editor.setSelection({ line: cursor.line + 3, ch: 0 }, { line: cursor.line + 3, ch: 8 });
            },
        });
        this.addCommand({
            id: 'add-reversed-card',
            name: '新建反向卡',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const blockId = generateBlockId();
                const template = `\n<mgo-card cardId="${blockId}" reverse>\n<mgo-card-front>Question</mgo-card-front>\n<mgo-card-back>Answer</mgo-card-back>\n</mgo-card>\n`;
                const cursor = editor.getCursor();
                editor.replaceRange(template, cursor);
                editor.setSelection({ line: cursor.line + 3, ch: 0 }, { line: cursor.line + 3, ch: 8 });
            },
        });
        this.addCommand({
            id: 'add-cloze-card',
            name: '新建填空卡',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const blockId = generateBlockId();
                const template = `\n<mgo-card cardId="${blockId}">\nSentence with ==c1::hidden text==.\n</mgo-card>\n`;
                const cursor = editor.getCursor();
                editor.replaceRange(template, cursor);
                editor.setSelection({ line: cursor.line + 2, ch: 19 }, { line: cursor.line + 2, ch: 30 });
            },
        });
        this.addCommand({
            id: 'cloze-from-selection',
            name: '由选中文本创建填空',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const selection = editor.getSelection();
                const line = editor.getLine(editor.getCursor().line);
                const clozeMatch = line.match(/==c(\d+)::/);
                const nextNum = clozeMatch ? parseInt(clozeMatch[1], 10) + 1 : 1;
                if (selection) {
                    if (line.includes('mgo-card')) {
                        editor.replaceSelection(`==c${nextNum}::${selection}==`);
                    } else {
                        const blockId = generateBlockId();
                        const lineNo = editor.getCursor().line;
                        editor.replaceRange(`<mgo-card cardId="${blockId}">${line.replace(selection, `==c${nextNum}::${selection}==`)}</mgo-card>`,
                            { line: lineNo, ch: 0 }, { line: lineNo, ch: line.length });
                    }
                } else {
                    const template = `<mgo-card cardId="${generateBlockId()}">Sentence with ==c1::text==</mgo-card>`;
                    editor.replaceSelection(template);
                }
            },
        });
        this.addCommand({
            id: 'add-typein-card',
            name: '新建输入作答卡',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const blockId = generateBlockId();
                const template = `\n\n<mgo-card cardId="${blockId}" type="typein">\n<mgo-card-front>Question</mgo-card-front>\n<mgo-card-back>Answer</mgo-card-back>\n</mgo-card>\n\n`;
                const cursor = editor.getCursor();
                editor.replaceRange(template, cursor);
                editor.setCursor({ line: cursor.line + 4, ch: 8 });
            },
        });
        this.addCommand({
            id: 'add-typein-single-line',
            name: '新建单行输入作答卡',
            editorCallback: (editor: Editor) => {
                const activeFile = this.app.workspace.getActiveFile();
                if (activeFile) void this.dataManager.ensureDeckTag(activeFile);
                const blockId = generateBlockId();
                const template = `\n<mgo-card cardId="${blockId}" type="typein">\n<mgo-card-front>Question</mgo-card-front>\n<mgo-card-back>Answer</mgo-card-back>\n</mgo-card>\n`;
                const cursor = editor.getCursor();
                editor.replaceRange(template, cursor);
                editor.setSelection({ line: cursor.line + 3, ch: 0 }, { line: cursor.line + 3, ch: 8 });
            },
        });
        this.addCommand({
            id: 'open-fsrs-dashboard',
            name: '打开仪表盘',
            callback: () => {
                void this.activateView();
            },
        });

        if (this.settings.usePouchDB) {
            this.addCommand({
                id: 'sync-now',
                name: '立即同步',
                callback: async () => {
                    if (!this.settings.syncEnabled) {
                        new Notice('尚未开启同步功能，请在设置中启用。');
                        return;
                    }
                    if (!this.settings.syncUrl) {
                        new Notice('尚未配置同步 URL，请在设置中填写。');
                        return;
                    }
                    new Notice('正在同步……');
                    await this.dataManager.initializeSync();
                },
            });

            this.addCommand({
                id: 'check-sync-status',
                name: '检查同步状态',
                callback: async () => {
                    const pouchDB = this.dataManager.getPouchDB();
                    if (!pouchDB) {
                        new Notice('未启用 PouchDB');
                        return;
                    }
                    const status = await pouchDB.getSyncStatus();
                    const info = await pouchDB.getDatabaseInfo();
                    const docCount = getDocCount(info);
                    new Notice(`同步状态：\n${status.enabled ? '✓ 已激活' : '✗ 未激活'}\nURL: ${status.remoteUrl ? sanitizeUrlForDisplay(status.remoteUrl) : '未设置'}\n文档数：${docCount}\n上次同步：${status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : '从未'}`, 10000);
                },
            });
        }

        this.addCommand({
            id: 'review-notes',
            name: '复习到期笔记',
            callback: async () => {
                const dueNotes = this.dataManager.getDueNotes();
                if (dueNotes.length === 0) {
                    new Notice('没有需要复习的笔记。');
                    return;
                }
                const { ReviewNoteModal } = await import('../ui/ReviewNoteModal');
                new ReviewNoteModal(this.app, this, dueNotes).open();
            },
        });

        this.addCommand({
            id: 'import-cards',
            name: '从文件导入卡片',
            callback: () => {
                new ImportCardsModal(this.app, this).open();
            },
        });

        this.addCommand({
            id: 'export-review-data',
            name: '导出复习数据（备份）',
            callback: async () => {
                if (!this.dataManager.isDataLoaded()) {
                    new Notice('MGO 仍在加载中，请稍后再试。');
                    return;
                }
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
                try {
                    const file = await this.app.vault.create(`MGO备份-${stamp}.json`, this.dataManager.exportBackup());
                    new Notice(`备份已保存到 ${file.path}`, 8000);
                } catch (error: unknown) {
                    new Notice(`备份失败：${getErrorMessage(error)}`, 8000);
                }
            },
        });

        this.addCommand({
            id: 'import-review-data',
            name: '从备份导入复习数据',
            callback: () => {
                new ImportBackupModal(this.app, this).open();
            },
        });

        this.addCommand({
            id: 'reset-all-card-progress',
            name: '重置全部卡片进度（危险操作）',
            callback: async () => {
                new ResetProgressModal(this.app, this).open();
            },
        });

        this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
            const selection = editor.getSelection();
            if (selection) {
                menu.addItem((item) => {
                    item.setTitle('由选中文本创建填空')
                        .setIcon('highlighter')
                        .onClick(() => {
                            const line = editor.getLine(editor.getCursor().line);
                            const clozeMatch = line.match(/==c(\d+)::/);
                            const nextNum = clozeMatch ? parseInt(clozeMatch[1], 10) + 1 : 1;
                            if (line.includes('mgo-card')) {
                                editor.replaceSelection(`==c${nextNum}::${selection}==`);
                            } else {
                                const blockId = generateBlockId();
                                const lineNo = editor.getCursor().line;
                                editor.replaceRange(`<mgo-card cardId="${blockId}">${line.replace(selection, `==c${nextNum}::${selection}==`)}</mgo-card>`,
                                    { line: lineNo, ch: 0 }, { line: lineNo, ch: line.length });
                            }
                        });
                });
            }
        }));

        const debouncedRefresh = debounce(() => {
            this.dataManager.recalculateAllDeckStats();
            this.refreshDashboardView();
        }, 500, true);

        const pendingModifiedFiles = new Set<TFile>();
        const processPendingFiles = debounce(async () => {
            if (pendingModifiedFiles.size === 0) return;
            const filesToProcess = Array.from(pendingModifiedFiles);
            pendingModifiedFiles.clear();

            let anyDeckUpdated = false;
            for (const file of filesToProcess) {
                try {
                    const changed = await this.dataManager.updateFile(file);
                    if (changed) anyDeckUpdated = true;
                } catch (e) {
                    console.error('Failed to update file:', e);
                }
            }

            if (anyDeckUpdated) {
                this.dataManager.recalculateAllDeckStats();
                this.refreshDashboardView();
            }
        }, 350, true);

        this.registerEvent(this.app.vault.on('create', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                pendingModifiedFiles.add(file);
                processPendingFiles();
            }
        }));
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                pendingModifiedFiles.add(file);
                processPendingFiles();
            }
        }));
        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFile && file.extension === 'md') {
                this.dataManager.handleFileDeleted(file.path);
                debouncedRefresh();
            }
        }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile && (file.extension === 'md' || oldPath.endsWith('.md'))) {
                void (async () => {
                    try {
                        await this.dataManager.renameDeck(file, oldPath);
                        debouncedRefresh();
                    } catch (e: unknown) {
                        console.error('Failed to rename deck:', e);
                    }
                })();
            }
        }));

        this.refreshDashboardView();
    }

    onunload() {
        void (async () => {
            try {
                await this.dataManager.stopSync();
            } catch (error: unknown) {
                console.error('Failed to stop sync during unload:', error);
            }
        })();
    }

    async loadSettings() {
        const data = (await this.loadData()) as PluginData | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
        // 旧版单标签设置迁移为多标签数组
        const legacy = data?.settings as Record<string, unknown> | undefined;
        if (legacy && typeof legacy.deckTag === 'string' && !Array.isArray(legacy.deckTags)) {
            const name = legacy.deckTag.replace(/^#/, '').trim().toLowerCase();
            this.settings.deckTags = name ? [name] : ['flashcards'];
        }
        if (!Array.isArray(this.settings.deckTags) || this.settings.deckTags.length === 0) {
            this.settings.deckTags = ['flashcards'];
        }
        this.settings.fsrsParams = Object.assign({}, DEFAULT_SETTINGS.fsrsParams, this.settings.fsrsParams);
        this.settings.gamification = Object.assign({}, DEFAULT_SETTINGS.gamification, this.settings.gamification);
        this.databaseNameIsNew = !data?.settings?.databaseName;
        const appId = (this.app as unknown as { appId?: unknown }).appId;
        const vaultKey = typeof appId === 'string' && appId ? appId : this.app.vault.getName();
        this.settings.databaseName = resolveDatabaseName(data?.settings?.databaseName, data !== null, vaultKey);
    }

    async saveSettings() {
        await this.dataManager.save();
    }

    async activateView() {
        const { workspace } = this.app;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
        let leaf = leaves.length > 0 ? leaves[0] : null;

        if (leaf) {
            const isSidebar = leaf.getRoot() !== workspace.rootSplit;
            if (isSidebar) {
                leaf.detach();
                leaf = null;
            } else {
                await workspace.revealLeaf(leaf);
                return;
            }
        }

        if (!leaf) {
            leaf = workspace.getLeaf('tab') || workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
        }

        await workspace.revealLeaf(leaf);
    }

    refreshDashboardView() {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];
        if (leaf?.view instanceof DashboardView) {
            (leaf.view).render();
        }
    }
}

export default FSRSFlashcardsPlugin;
export { FSRSFlashcardsPlugin };
