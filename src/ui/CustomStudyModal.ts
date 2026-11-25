import { App, Modal, Notice, Setting } from 'obsidian';
import { isRecord, toStringArray } from '../data/constants';
import type { Card } from '../data/types';
import { ReviewModal } from './ReviewModal';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class CustomStudyModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private tags: string = '';
    private state: 'new' | 'due' | 'learning' | 'all' = 'due';
    private limit: number = 50;
    private unlimited: boolean = false;

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.contentEl.empty();
        this.titleEl.setText('自定义学习会话');
        new Setting(this.contentEl).setName('按标签筛选').setDesc('用英文逗号分隔，例如 #高数, #第一章').addText(text => text.setValue(this.tags).onChange(val => this.tags = val));
        new Setting(this.contentEl).setName('按卡片状态筛选').addDropdown((dropdown) => dropdown
            .addOption('due', '到期')
            .addOption('new', '新卡')
            .addOption('learning', '学习中')
            .addOption('all', '全部卡片（临时抱佛脚模式）')
            .setValue(this.state)
            .onChange((value) => {
                if (value === 'due' || value === 'new' || value === 'learning' || value === 'all') {
                    this.state = value;
                }
            }));
        new Setting(this.contentEl).setName('卡片数量上限').setDesc('设为 0 或开启不限量即为不限制').addText(text => text.setValue(this.limit.toString()).onChange(val => this.limit = parseInt(val) || 0));
        new Setting(this.contentEl).setName('不限量卡片').setDesc('忽略数量上限，学习所有匹配的卡片（适用于考前冲刺）').addToggle(toggle => toggle.setValue(this.unlimited).onChange(val => this.unlimited = val));
        new Setting(this.contentEl).addButton(btn => btn.setButtonText('开始学习').setCta().onClick(() => this.startSession()));
    }

    startSession() {
        const now = new Date();
        const allCards = this.plugin.dataManager.getAllCards();
        const requiredTags = this.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

        let queue = allCards.filter((card: Card) => {
            const data = card.fsrsData;
            if (this.state !== 'all') {
                const cardState = !data ? 'new' : data.due <= now ? 'due' : 'learning';
                if (this.state !== cardState) return false;
            }
            if (requiredTags.length > 0) {
                const fileCache = this.app.metadataCache.getCache(card.filePath);
                const inlineTags = (fileCache?.tags ?? []).map((tag) => tag.tag.toLowerCase());
                const frontmatter = isRecord(fileCache?.frontmatter) ? fileCache.frontmatter : null;
                const frontmatterTags = frontmatter
                    ? toStringArray(frontmatter.tags).map((tag) => `#${tag.toLowerCase()}`)
                    : [];
                const fileTags = inlineTags.concat(frontmatterTags);
                return requiredTags.every(reqTag => fileTags.includes(reqTag));
            }
            return true;
        });

        if (!this.unlimited && this.limit > 0) {
            queue = queue.slice(0, this.limit);
        }

        if (queue.length === 0) { new Notice('没有找到符合条件的卡片。'); return; }
        this.close();
        new ReviewModal(this.app, this.plugin, queue).open();
    }
}
