import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import { generatorParameters } from 'ts-fsrs';
import { getDocCount, getErrorMessage, buildAuthenticatedUrl, usesInsecureHttp } from '../data/constants';
import { DataMigration, type LegacyPluginData } from '../database/DataMigration';
import { ResetProgressModal } from './ResetProgressModal';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class FSRSSettingsTab extends PluginSettingTab {
    plugin: FSRSFlashcardsPlugin;
    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    getSettingDefinitions(): unknown[] {
        return [];
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        const tabNav = containerEl.createDiv({ cls: 'mgo-tab-nav' });
        const tabContent = containerEl.createDiv({ cls: 'mgo-tab-content' });

        const tabs = [
            { id: 'general', label: '通用' },
            { id: 'sync', label: '同步' },
            { id: 'advanced', label: '高级' },
            { id: 'about', label: '关于' },
        ];

        const showTab = (tabId: string) => {
            tabContent.empty();
            tabNav.querySelectorAll('.mgo-tab-button').forEach(b => b.removeClass('active'));
            tabNav.querySelector(`[data-tab="${tabId}"]`)?.addClass('active');
            switch (tabId) {
                case 'general': this.renderGeneralTab(tabContent); break;
                case 'sync': this.renderSyncTab(tabContent); break;
                case 'advanced': this.renderAdvancedTab(tabContent); break;
                case 'about': this.renderAboutTab(tabContent); break;
            }
        };

        tabs.forEach(tab => {
            const btn = tabNav.createEl('button', { cls: 'mgo-tab-button', text: tab.label });
            btn.setAttribute('data-tab', tab.id);
            btn.addEventListener('click', () => showTab(tab.id));
        });

        showTab('general');
    }

    private renderGeneralTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName('复习默认值').setHeading();

        new Setting(containerEl)
            .setName('每日新卡上限')
            .setDesc('每个牌组每天引入新卡的默认数量上限。你可以在单个笔记的 frontmatter 中覆盖此设置（例如 newCardsPerDay: 15）。')
            .addText((text) => text
                .setValue(this.plugin.settings.newCardsPerDay.toString())
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num >= 0) {
                        this.plugin.settings.newCardsPerDay = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('每日复习上限')
            .setDesc('每个牌组每天复习卡的默认数量上限。你可以在单个笔记的 frontmatter 中覆盖此设置（例如 reviewsPerDay: 50）。')
            .addText((text) => text
                .setValue(this.plugin.settings.reviewsPerDay.toString())
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num >= 0) {
                        this.plugin.settings.reviewsPerDay = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('隐藏同辈卡至次日')
            .setDesc('学习时，把同辈卡（例如同一条笔记的其他填空题卡）推迟到第二天再出现，避免回忆线索互相泄露。')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.burySiblings ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.burySiblings = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('顽固卡阈值')
            .setDesc('一张卡累计失误（忘记）多少次后，在复习和浏览时给出顽固卡提醒。设为 0 表示关闭。')
            .addText((text) => text
                .setValue((this.plugin.settings.leechThreshold ?? 8).toString())
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num >= 0) {
                        this.plugin.settings.leechThreshold = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl).setName('牌组组织方式').setHeading();

        new Setting(containerEl)
            .setName('牌组标签')
            .setDesc('识别牌组笔记的根标签，多个用逗号分隔（例如 flashcards, ja-card, en-card）。标签里的 / 表示子牌组层级。')
            .addText((text) => text
                .setPlaceholder('Flashcards, ja-card')
                .setValue(this.plugin.settings.deckTags.join(', '))
                .onChange(async (value) => {
                    const parsed = value.split(',')
                        .map(t => t.trim().replace(/^#/, '').toLowerCase())
                        .filter(Boolean);
                    const next = parsed.length > 0 ? parsed : ['flashcards'];
                    if (next.join(',') === this.plugin.settings.deckTags.join(',')) return;
                    this.plugin.settings.deckTags = next;
                    await this.plugin.saveSettings();
                    await this.plugin.dataManager.buildIndex();
                    this.plugin.refreshDashboardView();
                }));

        new Setting(containerEl).setName('外观').setHeading();

        new Setting(containerEl)
            .setName('复习字号')
            .setDesc('闪卡复习窗口中的文字字号。')
            .addSlider((slider) => slider
                .setLimits(12, 32, 1)
                .setValue(this.plugin.settings.fontSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.fontSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('存储与数据库').setHeading();

        new Setting(containerEl)
            .setName('使用 PouchDB（IndexedDB）')
            .setDesc('把复习进度存放在高性能的浏览器存储（IndexedDB）中，而不是单个 data.json 文件。卡片数超过 500 或开启同步时推荐使用。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.usePouchDB)
                .onChange(async (value) => {
                    this.plugin.settings.usePouchDB = value;
                    await this.plugin.saveSettings();
                    new Notice('请重新加载 Obsidian 以使此更改生效');
                }));

        new Setting(containerEl)
            .setName('迁移到 PouchDB')
            .setDesc('把现有的 data.json 转换为 PouchDB 格式（需先启用 PouchDB）。')
            .setDisabled(!this.plugin.settings.usePouchDB)
            .addButton(btn => btn
                .setButtonText('立即迁移')
                .setCta()
                .onClick(async () => {
                    await this.migrateData();
                }));

        new Setting(containerEl).setName('重置进度').setHeading();

        new Setting(containerEl)
            .setName('重置全部卡片进度')
            .setDesc('永久删除所有复习历史，从零开始。')
            .addButton(btn => btn
                .setButtonText('重置进度')
                .setWarning()
                .onClick(() => new ResetProgressModal(this.app, this.plugin).open()));
    }

    private renderSyncTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName('同步').setHeading();

        new Setting(containerEl)
            .setName('启用同步')
            .setDesc('将闪卡数据与 CouchDB 服务器同步')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.syncEnabled = value;
                    await this.plugin.saveSettings();

                    const pouchDB = this.plugin.dataManager.getPouchDB();
                    if (value && pouchDB) {
                        await this.setupSync();
                    } else if (!value && pouchDB) {
                        await pouchDB.stopSync();
                        new Notice('同步已关闭');
                    }
                }));

        new Setting(containerEl)
            .setName('CouchDB 服务器 URL')
            .setDesc('你的 CouchDB 服务器 URL（例如 https://example.com:5984/db）')
            .addText(text => text
                .setPlaceholder('输入服务器 URL（例如 https://example.com:5984/db）')
                .setValue(this.plugin.settings.syncUrl)
                .onChange(async (value) => {
                    this.plugin.settings.syncUrl = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('数据库名称')
            .setDesc('CouchDB 服务器上使用的数据库名称')
            .addText(text => text
                .setPlaceholder('MGO')
                .setValue(this.plugin.settings.syncDbName)
                .onChange(async (value) => {
                    this.plugin.settings.syncDbName = value.trim() || 'mgo';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('用户名')
            .setDesc('用于身份验证的 CouchDB 用户名')
            .addText(text => text
                .setPlaceholder('Admin')
                .setValue(this.plugin.settings.syncUsername)
                .onChange(async (value) => {
                    this.plugin.settings.syncUsername = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('密码')
            .setDesc('CouchDB 密码（保存在此保险库的插件数据文件中）')
            .addText(text => {
                text.setPlaceholder('请输入密码')
                    .setValue(this.plugin.settings.syncPassword)
                    .onChange(async (value) => {
                        this.plugin.settings.syncPassword = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.type = 'password';
                return text;
            });

        new Setting(containerEl)
            .setName('测试同步')
            .setDesc('在设置页校验连接，并执行一次同步检查')
            .setDisabled(!this.plugin.settings.usePouchDB)
            .addButton((btn) => btn
                .setButtonText('运行测试')
                .onClick(async () => {
                    await this.testSyncConnection();
                }));

        if (this.plugin.settings.syncEnabled && this.plugin.dataManager.getPouchDB()) {
            new Setting(containerEl)
                .setName('同步状态')
                .setDesc('查看当前的同步状态')
                .addButton(btn => btn
                    .setButtonText('检查状态')
                    .onClick(async () => {
                        const pouchDB = this.plugin.dataManager.getPouchDB();
                        if (pouchDB) {
                            const status = await pouchDB.getSyncStatus();
                            const info = await pouchDB.getDatabaseInfo();
                            const docCount = getDocCount(info);
                            new Notice(`同步状态：${status.enabled ? '进行中' : '未运行'}\n文档数：${docCount}\n上次同步：${status.lastSyncTime || '从未'}`, 10000);
                        }
                    }));
        }
    }

    private renderAdvancedTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName('FSRS 参数').setHeading();
        containerEl.createEl('p', {
            text: '这些设置控制排程算法。只有在清楚自己在做什么的情况下才建议修改。',
            cls: 'setting-item-description',
        });

        new Setting(containerEl)
            .setName('重置 FSRS 参数')
            .setDesc('恢复为 FSRS 默认参数。')
            .addButton((btn) => btn
                .setButtonText('重置')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.fsrsParams = generatorParameters();
                    await this.plugin.saveSettings();
                    this.plugin.dataManager.updateFsrsParameters(this.plugin.settings.fsrsParams);
                    this.display();
                }));

        new Setting(containerEl)
            .setName('期望保留率')
            .setDesc('卡片到期时希望达到的回忆概率（0.7 到 0.99）。取值越高（例如 0.90 = 90%），间隔越短、复习越频繁；取值越低则间隔越长。可在单个笔记的 frontmatter 中覆盖（例如 requestRetention: 0.85）。')
            .addText((text) => text
                .setValue(this.plugin.settings.fsrsParams.request_retention.toString())
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num) && num > 0 && num < 1) {
                        this.plugin.settings.fsrsParams.request_retention = num;
                        await this.plugin.saveSettings();
                        this.plugin.dataManager.updateFsrsParameters(this.plugin.settings.fsrsParams);
                    }
                }));

        new Setting(containerEl)
            .setName('最大间隔')
            .setDesc('两次复习之间的最大排程间隔（单位：天，默认 36500 天 = 100 年）。')
            .addText((text) => text
                .setValue(this.plugin.settings.fsrsParams.maximum_interval.toString())
                .onChange(async (value) => {
                    const num = parseInt(value, 10);
                    if (!isNaN(num) && num > 0) {
                        this.plugin.settings.fsrsParams.maximum_interval = num;
                        await this.plugin.saveSettings();
                        this.plugin.dataManager.updateFsrsParameters(this.plugin.settings.fsrsParams);
                    }
                }));

        new Setting(containerEl)
            .setName('FSRS 权重')
            .setDesc('决定记忆稳定性和难度的 FSRS 模型参数（19 个数字）。可使用下方的优化器自动调优。')
            .addTextArea((text) => {
                text.setValue(this.plugin.settings.fsrsParams.w.join(', '))
                    .onChange(async (value) => {
                        try {
                            const weights = value.split(',').map((entry) => parseFloat(entry.trim()));
                            if ((weights.length === 19 || weights.length === 17) && weights.every((weight) => !isNaN(weight))) {
                                this.plugin.settings.fsrsParams.w = weights;
                                await this.plugin.saveSettings();
                                this.plugin.dataManager.updateFsrsParameters(this.plugin.settings.fsrsParams);
                            }
                        } catch (error: unknown) {
                            console.error('Invalid FSRS weights format', error);
                        }
                    });
                text.inputEl.rows = 5;
                text.inputEl.addClass('fsrs-weights-textarea');
            });

        new Setting(containerEl).setName('参数优化').setHeading();
        new Setting(containerEl)
            .setName('优化 FSRS 权重')
            .setDesc('根据你的复习历史自动调优 FSRS 权重，让排程更准确。')
            .addButton(btn => btn
                .setButtonText('运行优化器')
                .setCta()
                .onClick(async () => {
                    const { OptimizerModal } = await import('./OptimizerModal');
                    new OptimizerModal(this.app, this.plugin).open();
                }));
    }

    private renderAboutTab(containerEl: HTMLElement) {
        new Setting(containerEl).setName('关于').setHeading();

        new Setting(containerEl)
            .setName('MGO')
            .setDesc(`v${this.plugin.manifest.version} — 基于 Lemma（Fundaments Work 创作，MIT 协议）二次开发的 FSRS 间隔重复闪卡插件。`);

        new Setting(containerEl)
            .setName('文档与指南')
            .setDesc('打开可交互的闪卡编写指南与使用技巧。')
            .addButton((btn) => btn
                .setButtonText('打开指南')
                .onClick(async () => {
                    const { HelpModal } = await import('./HelpModal');
                    new HelpModal(this.app, this.plugin).open();
                }));

        new Setting(containerEl)
            .setName('GitHub 仓库')
            .setDesc('在 GitHub 上查看源码、提交问题并跟进版本发布。')
            .addButton((btn) => btn
                .setButtonText('打开仓库')
                .onClick(() => {
                    activeWindow.open('https://github.com/XXmgGo/MGO', '_blank');
                }));

        new Setting(containerEl)
            .setName('许可证')
            .setDesc(`以 MIT 协议发布，版权 2025-2026 ${this.plugin.manifest.author}。`)
            .addButton((btn) => btn
                .setButtonText('查看许可证')
                .onClick(() => {
                    activeWindow.open('https://github.com/XXmgGo/MGO/blob/main/LICENSE', '_blank');
                }));

        new Setting(containerEl).setName('卡片语法速查').setHeading();

        const cardBox = containerEl.createDiv({ cls: 'mgo-about-cheatsheet' });
        const cardGrid = cardBox.createDiv({ cls: 'mgo-about-grid' });
        const cardFormats: [string, string][] = [
            ['基础卡', '<mgo-card cardId="id">问题<mgo-a>答案</mgo-a></mgo-card>'],
            ['反向卡', '<mgo-card cardId="id" reverse>…（双向回忆）'],
            ['填空题', '<mgo-card cardId="id">句子含 ==c1::挖空==</mgo-card>'],
            ['图片遮罩', '正反面各一张 ![[图]]（原地覆盖）'],
            ['输入作答', '<mgo-card cardId="id" type="typein">…'],
            ['整篇笔记', '给笔记加上 #review 标签即可整页学习'],
        ];
        for (const [key, desc] of cardFormats) {
            cardGrid.createSpan({ cls: 'mgo-about-key', text: key });
            cardGrid.createSpan({ cls: 'mgo-about-val', text: desc });
        }

        new Setting(containerEl).setName('复习快捷键').setHeading();

        const shortcutBox = containerEl.createDiv({ cls: 'mgo-about-cheatsheet' });
        const shortcutGrid = shortcutBox.createDiv({ cls: 'mgo-about-grid' });
        const shortcuts: [string, string][] = [
            ['空格 / 回车', '显示答案，或切换预览'],
            ['1 / 2 / 3 / 4', '评分：重来（1）、困难（2）、良好（3）、简单（4）'],
            ['Esc', '结束本次学习并保存进度'],
            ['滑动手势', '左：重来 · 下：困难 · 右：良好 · 上：简单'],
        ];
        for (const [key, desc] of shortcuts) {
            shortcutGrid.createSpan({ cls: 'mgo-about-key', text: key });
            shortcutGrid.createSpan({ cls: 'mgo-about-val', text: desc });
        }
    }

    async migrateData() {
        const pouchDB = this.plugin.dataManager.getPouchDB();
        if (!pouchDB) {
            new Notice('未启用 PouchDB');
            return;
        }

        try {
            new Notice('开始迁移……如果卡片数量很多，可能需要一些时间。');

            const legacyData = (await this.plugin.loadData()) as LegacyPluginData | null;
            if (!legacyData) {
                new Notice('没有找到可迁移的旧版数据');
                return;
            }

            const deckMapping: Record<string, { deckId: string; filePath: string }> = {};
            for (const card of this.plugin.dataManager.getAllCards()) {
                deckMapping[card.id] = {
                    deckId: card.deckId,
                    filePath: card.filePath,
                };
            }

            const migration = new DataMigration(pouchDB);
            await migration.migrateFromLegacy(legacyData, deckMapping);

            const verification = await migration.verifyMigration(legacyData);

            if (verification.success) {
                new Notice(`迁移成功！已迁移 ${verification.stats.migratedCards} 张卡片和 ${verification.stats.migratedLogs} 条复习记录。`);
                this.plugin.settings.usePouchDB = true;
                await this.plugin.saveSettings();
                this.display();
            } else {
                new Notice(`迁移完成但存在错误：${verification.errors.join(', ')}`, 10000);
            }

        } catch (error) {
            console.error('Migration failed:', error);
            new Notice(`迁移失败：${getErrorMessage(error)}`);
        }
    }

    async setupSync() {
        const pouchDB = this.plugin.dataManager.getPouchDB();
        if (!pouchDB) {
            new Notice('未启用 PouchDB');
            return;
        }

        if (!this.plugin.settings.syncUrl) {
            new Notice('请先输入 CouchDB 服务器 URL');
            return;
        }

        if (!this.plugin.settings.syncUsername || !this.plugin.settings.syncPassword) {
            new Notice('请同时填写用户名和密码');
            return;
        }

        try {
            new Notice('正在设置同步……');
            if (usesInsecureHttp(this.plugin.settings.syncUrl)) {
                new Notice('警告：此同步 URL 使用 http，凭据和复习数据将以明文发送。', 8000);
            }
            const syncUrl = buildAuthenticatedUrl(
                this.plugin.settings.syncUrl,
                this.plugin.settings.syncDbName,
                this.plugin.settings.syncUsername,
                this.plugin.settings.syncPassword,
            );
            await pouchDB.setupSync(syncUrl);
            new Notice('同步已成功启用！');
        } catch (error) {
            console.error('Sync setup failed:', error);
            new Notice(`同步设置失败：${getErrorMessage(error)}`);
            this.plugin.settings.syncEnabled = false;
            await this.plugin.saveSettings();
        }
    }

    async testSyncConnection() {
        const pouchDB = this.plugin.dataManager.getPouchDB();
        if (!pouchDB) {
            new Notice('未启用 PouchDB');
            return;
        }

        if (!this.plugin.settings.syncUrl) {
            new Notice('请先输入 CouchDB 服务器 URL');
            return;
        }

        try {
            new Notice('正在测试同步连接……');
            if (usesInsecureHttp(this.plugin.settings.syncUrl)) {
                new Notice('警告：此同步 URL 使用 http，凭据和复习数据将以明文发送。', 8000);
            }
            const syncUrl = buildAuthenticatedUrl(
                this.plugin.settings.syncUrl,
                this.plugin.settings.syncDbName,
                this.plugin.settings.syncUsername,
                this.plugin.settings.syncPassword,
            );

            const { remoteInfo, localInfo } = await pouchDB.testConnection(syncUrl);
            const localDocCount = getDocCount(localInfo);
            const remoteDocCount = getDocCount(remoteInfo);

            let syncMessage = '仅检查连接（同步已关闭）。';
            if (this.plugin.settings.syncEnabled) {
                await pouchDB.setupSync(syncUrl);
                await pouchDB.manualSync();
                syncMessage = '手动同步检查通过。';
            }

            new Notice(
                `同步测试通过。\n本地文档数：${localDocCount}\n远端文档数：${remoteDocCount}\n${syncMessage}`,
                10000,
            );
        } catch (error) {
            console.error('Sync test failed:', error);
            new Notice(`同步测试失败：${getErrorMessage(error)}`, 8000);
        }
    }

}
