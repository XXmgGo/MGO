import { App, Modal, Setting, Notice, normalizePath } from 'obsidian';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class CreateDeckModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private deckName = '';
    private folderPath = '';

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.titleEl.setText('新建牌组');
        const container = this.contentEl.createDiv({ cls: 'fsrs-create-deck-container' });

        new Setting(container)
            .setName('牌组标题')
            .setDesc('要创建的牌组笔记的标题')
            .addText(text => text
                .setPlaceholder('例如：神经科学 101')
                .onChange(val => {
                    this.deckName = val.trim();
                }));

        new Setting(container)
            .setName('文件夹（可选）')
            .setDesc('留空则创建在仓库根目录')
            .addText(text => text
                .setPlaceholder('例如：Flashcards 或 study/decks')
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
        if (!this.deckName) {
            new Notice('请输入牌组标题。');
            return;
        }

        const cleanName = this.deckName.replace(/[\\/:*?"<>|]/g, '-');
        let fullPath = cleanName.endsWith('.md') ? cleanName : `${cleanName}.md`;

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

        const deckTagName = this.plugin.settings.deckTag.replace(/^#/, '');
        const initialContent = `---\ntags:\n  - ${deckTagName}\n---\n\n# ${this.deckName}\n\n`;

        const newFile = await this.app.vault.create(fullPath, initialContent);
        this.close();

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(newFile);
        new Notice(`牌组已创建：${this.deckName}`);
        this.plugin.refreshDashboardView();
    }
}
