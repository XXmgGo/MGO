import { App, Modal, Setting, Notice, normalizePath } from 'obsidian';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class CreateDeckModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private tagPath = '';
    private folderPath = '';

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.titleEl.setText('新建牌组');
        const container = this.contentEl.createDiv({ cls: 'fsrs-create-deck-container' });

        new Setting(container)
            .setName('牌组标签路径')
            .setDesc('用 / 表示子牌组层级，例如 ja-card/文法。插件会新建一篇笔记并挂上该标签。')
            .addText(text => text
                .setPlaceholder('例如：ja-card/文法')
                .onChange(val => {
                    this.tagPath = val.trim();
                }));

        new Setting(container)
            .setName('文件夹（可选）')
            .setDesc('笔记存放位置，留空则创建在仓库根目录')
            .addText(text => text
                .setPlaceholder('例如：日本語 或 study/decks')
                .onChange(val => {
                    this.folderPath = val.trim();
                }));

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('取消')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('创建牌组')
                .setCta()
                .onClick(() => void this.handleCreate()));

        this.scope.register([], 'Enter', () => void this.handleCreate());
    }

    onClose() {
        this.contentEl.empty();
    }

    private async handleCreate() {
        const cleanTag = this.tagPath.replace(/^#/, '').trim();
        if (!cleanTag) {
            new Notice('请输入牌组标签路径。');
            return;
        }

        const roots = this.plugin.settings.deckTags.map(t => t.replace(/^#/, '').trim().toLowerCase());
        const lower = cleanTag.toLowerCase();
        const isUnderRoot = roots.some(r => lower === r || lower.startsWith(r + '/'));
        if (!isUnderRoot) {
            new Notice(`标签需以已配置的牌组根标签开头（${roots.join('、')}）。`);
            return;
        }

        const lastSegment = cleanTag.split('/').pop() || cleanTag;
        const baseName = lastSegment.replace(/[\\/:*?"<>|]/g, '-');
        let fullPath = `${baseName}.md`;

        if (this.folderPath) {
            const cleanFolder = normalizePath(this.folderPath);
            if (!this.app.vault.getAbstractFileByPath(cleanFolder)) {
                await this.app.vault.createFolder(cleanFolder);
            }
            fullPath = `${cleanFolder}/${fullPath}`;
        }
        fullPath = normalizePath(fullPath);

        const existing = this.app.vault.getAbstractFileByPath(fullPath);
        if (existing) {
            new Notice(`该路径下已存在文件：${fullPath}`);
            return;
        }

        const initialContent = `---\ntags:\n  - ${cleanTag}\n---\n\n# ${lastSegment}\n\n`;

        const newFile = await this.app.vault.create(fullPath, initialContent);
        this.close();

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(newFile);
        new Notice(`牌组已创建：#${cleanTag}`);
        this.plugin.refreshDashboardView();
    }
}
