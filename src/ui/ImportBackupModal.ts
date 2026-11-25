import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import { parseBackup, type BackupContent } from '../data/backup';
import { getErrorMessage } from '../data/constants';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class ImportBackupModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private content: BackupContent | null = null;

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.titleEl.setText('导入复习数据');
        const intro = this.contentEl.createEl('p', {
            text: '选择一个 MGO 备份文件或 data.json 文件。排程会合并：每张卡片保留复习时间更晚的版本，不会删除任何内容。',
        });
        intro.addClass('fsrs-import-intro');

        const input = this.contentEl.createEl('input', {
            attr: { type: 'file', accept: '.json,application/json', 'aria-label': '备份文件' },
        });
        const summary = this.contentEl.createDiv({ cls: 'fsrs-import-summary' });
        const actions = this.contentEl.createDiv({ cls: 'modal-button-container' });
        const importBtn = new ButtonComponent(actions).setButtonText('导入').setCta().setDisabled(true);
        importBtn.onClick(() => { void this.runImport(importBtn); });

        input.addEventListener('change', () => {
            void (async () => {
                this.content = null;
                importBtn.setDisabled(true);
                const file = input.files?.[0];
                if (!file) return;
                try {
                    this.content = parseBackup(await file.text());
                    const cards = Object.keys(this.content.cardData).length;
                    summary.setText(`找到 ${cards} 条卡片排程和 ${this.content.reviewHistory.length} 条复习记录。`
                        + (this.content.skipped ? ` 其中 ${this.content.skipped} 条无效记录将被跳过。` : ''));
                    importBtn.setDisabled(cards === 0 && this.content.reviewHistory.length === 0);
                } catch (error: unknown) {
                    summary.setText(getErrorMessage(error));
                }
            })();
        });
    }

    private async runImport(button: ButtonComponent) {
        if (!this.content) return;
        button.setDisabled(true);
        try {
            const result = await this.plugin.dataManager.importBackup(this.content);
            new Notice(`已导入 ${result.cards} 条排程（其中 ${result.matched} 条匹配本仓库的卡片）和 ${result.reviews} 条复习记录。`, 8000);
            this.plugin.refreshDashboardView();
            this.close();
        } catch (error: unknown) {
            new Notice(`导入失败：${getErrorMessage(error)}`, 8000);
            button.setDisabled(false);
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
