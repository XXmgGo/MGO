import { App, Modal } from 'obsidian';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class HelpModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.contentEl.empty();
        this.titleEl.setText('帮助与指南');
        this.containerEl.addClass('fsrs-help-modal');

        const header = this.contentEl.createDiv({ cls: 'fsrs-help-header' });
        header.createEl('h2', { text: 'MGO' });
        header.createEl('p', { text: `v${this.plugin.manifest.version} — 基于 FSRS 算法的间隔重复闪卡插件。` });

        this.renderSection('创建牌组', [
            `给任意笔记添加 #${this.plugin.settings.deckTag} 标签，即可把它变成一个牌组。`,
            '可以在插件设置中修改该标签。',
            '每个带牌组标签的笔记都会成为独立的牌组。',
        ], [
            `使用 frontmatter：tags: [${this.plugin.settings.deckTag}]`,
            `或使用行内标签：# 我的笔记 #${this.plugin.settings.deckTag}`,
        ]);

        this.renderSection('卡片格式', [
            '基础卡片分为正面（问题）与背面（答案）。',
            '填空卡片会隐藏句子中的特定词语。',
            '可以用命令面板插入卡片模板。',
        ], [
            '基础：---card--- ^id / 正面 / --- / 背面 / ---end---',
            '填空：==c1::被隐藏的文本==',
            '使用块 ID（^unique-id）可在编辑卡片时保留复习历史。',
        ]);

        this.renderSection('复习快捷键', [], [
            ['空格 / 回车', '显示答案'],
            ['1', '重来'],
            ['2', '困难'],
            ['3', '良好'],
            ['4', '简单'],
            ['Z', '撤销上一次评分'],
            ['Esc', '退出复习会话'],
        ]);

        this.renderSection('使用建议', [
            '用自定义学习功能按标签或卡片状态筛选。',
            '卡片数量较多时启用 PouchDB，可提升性能。',
            '用同步功能通过 CouchDB 在多设备间保持数据一致。',
            '完整文档见插件设置中的「关于」部分。',
        ], []);
    }

    private renderSection(title: string, paragraphs: string[], items: string[] | string[][]) {
        const section = this.contentEl.createDiv({ cls: 'fsrs-help-section' });
        section.createEl('h3', { text: title });

        for (const p of paragraphs) {
            section.createEl('p', { text: p });
        }

        if (items.length > 0) {
            if (Array.isArray(items[0])) {
                const grid = section.createDiv({ cls: 'fsrs-help-shortcuts' });
                for (const [key, desc] of items as string[][]) {
                    grid.createSpan({ cls: 'fsrs-help-key', text: key });
                    grid.createSpan({ text: desc });
                }
            } else {
                const ul = section.createEl('ul');
                for (const item of items as string[]) {
                    ul.createEl('li', { text: item });
                }
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
