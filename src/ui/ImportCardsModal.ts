import { App, ButtonComponent, Modal, Notice, Setting, normalizePath } from 'obsidian';
import { convertToMGO, type CardImportResult } from '../data/importCards';
import { getErrorMessage } from '../data/constants';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class ImportCardsModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private deckName = '导入的卡片';
    private text = '';

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.titleEl.setText('导入卡片');
        this.contentEl.createEl('p', {
            text: '选择其他闪卡应用导出的纯文本文件，或逗号分隔、制表符分隔的文件。第一列作为正面，第二列作为背面。卡片将以新知识状态开始，不导入排程数据。',
        });

        new Setting(this.contentEl)
            .setName('牌组笔记名称')
            .setDesc('将在仓库根目录创建一个使用该名称的新笔记。')
            .addText((text) => text
                .setValue(this.deckName)
                .onChange((value) => { this.deckName = value; }));

        const input = this.contentEl.createEl('input', {
            attr: { type: 'file', accept: '.txt,.csv,.tsv,text/plain,text/csv', 'aria-label': '卡片文件' },
        });
        const summary = this.contentEl.createDiv({ cls: 'fsrs-import-summary' });
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        const importBtn = new ButtonComponent(actions).setButtonText('创建牌组').setCta().setDisabled(true);

        let preview: CardImportResult | null = null;
        input.addEventListener('change', () => {
            void (async () => {
                preview = null;
                importBtn.setDisabled(true);
                const file = input.files?.[0];
                if (!file) return;
                this.text = await file.text();
                preview = convertToMGO(this.text, this.plugin.settings.deckTag);
                summary.setText(`找到 ${preview.cards} 张卡片。` + (preview.skipped ? ` 其中 ${preview.skipped} 行不完整，将被跳过。` : ''));
                importBtn.setDisabled(preview.cards === 0);
            })();
        });

        importBtn.onClick(() => {
            void (async () => {
                if (!preview) return;
                importBtn.setDisabled(true);
                try {
                    const base = this.deckName.trim().replace(/[\\/:*?"<>|#^[\]]/g, '') || '导入的卡片';
                    let path = normalizePath(`${base}.md`);
                    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = normalizePath(`${base} ${n}.md`);
                    const file = await this.app.vault.create(path, preview.markdown);
                    new Notice(`已创建 ${file.path}，包含 ${preview.cards} 张卡片。`, 8000);
                    this.close();
                } catch (error: unknown) {
                    new Notice(`导入失败：${getErrorMessage(error)}`, 8000);
                    importBtn.setDisabled(false);
                }
            })();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}
