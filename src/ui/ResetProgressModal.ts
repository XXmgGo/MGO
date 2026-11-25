import { App, Modal, Notice, Setting } from 'obsidian';
import { State } from 'ts-fsrs';
import type { Card } from '../data/types';
import { getErrorMessage } from '../data/constants';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class ResetProgressModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private confirmText: string = '';

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.contentEl.empty();
        this.titleEl.setText('重置全部卡片进度');

        const warningContainer = this.contentEl.createDiv({ cls: 'fsrs-reset-warning' });
        warningContainer.addClass('setting-item-heading');

        warningContainer.createEl('h3', {
            text: '警告：此操作无法撤销。',
            cls: 'mod-warning',
        });

        warningContainer.createEl('p', {
            text: '此操作将永久删除你的全部复习记录和卡片进度：',
        });

        const consequences = warningContainer.createEl('ul');
        consequences.createEl('li', { text: '所有卡片都会重置为“新知识”状态' });
        consequences.createEl('li', { text: '所有复习记录都会被删除' });
        consequences.createEl('li', { text: '所有 FSRS 排程数据都会被清空' });
        consequences.createEl('li', { text: '每张卡片都要从头开始' });

        const statsContainer = this.contentEl.createDiv({ cls: 'fsrs-reset-stats' });

        const allCards = this.plugin.dataManager.getAllCards();
        const cardsWithProgress = allCards.filter((card: Card) => card.fsrsData && card.fsrsData.state !== State.New).length;

        statsContainer.createEl('h4', { text: '当前数据：' });
        const statsList = statsContainer.createEl('ul');
        statsList.createEl('li', { text: `卡片总数：${allCards.length}` });
        statsList.createEl('li', { text: `已有进度的卡片：${cardsWithProgress}` });

        new Setting(this.contentEl)
            .setName('输入 “delete” 以确认')
            .setDesc('此确认步骤用于防止误删数据')
            .addText(text => text
                .setPlaceholder('Delete')
                .onChange(val => this.confirmText = val));

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText('取消')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('删除全部进度')
                .setWarning()
                .onClick(async () => {
                    if (this.confirmText.trim().toLowerCase() !== 'delete') {
                        new Notice('请输入 “delete” 以确认', 3000);
                        return;
                    }
                    await this.resetAllProgress();
                }));
    }

    private async resetAllProgress() {
        try {
            new Notice('正在删除全部卡片进度……', 0);

            await this.plugin.dataManager.resetAllProgress();

            this.plugin.refreshDashboardView();

            this.close();
            new Notice('全部卡片进度已重置，所有卡片现在都是“新知识”状态。', 5000);
        } catch (error) {
            console.error('Failed to reset progress:', error);
            new Notice(`重置失败：${getErrorMessage(error)}`, 5000);
        }
    }
}
