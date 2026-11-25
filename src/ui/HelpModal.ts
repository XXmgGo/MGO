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
            `给任意笔记添加 #${this.plugin.settings.deckTags[0] ?? 'flashcards'} 标签，它就成了牌组的一员。`,
            '可以在插件设置中配置多个牌组标签（逗号分隔）。',
            '标签里的 / 表示子牌组层级：#ja-card/文法 的卡片归入 ja-card → 文法。',
            '多个笔记打相同标签时，它们的卡片会合并进同一个牌组。',
        ], [
            `使用 frontmatter：tags: [${this.plugin.settings.deckTags[0] ?? 'flashcards'}/文法]`,
            `或使用行内标签：# 我的笔记 #${this.plugin.settings.deckTags[0] ?? 'flashcards'}/文法`,
        ]);

        this.renderSection('卡片格式', [
            '基础卡片分为正面（问题）与背面（答案）。',
            '填空卡片会隐藏句子中的特定词语。',
            '可以用命令面板插入卡片模板。',
        ], [
            '基础：<mgo-card cardId="唯一id">问题<mgo-a>答案</mgo-a></mgo-card>',
            '填空：<mgo-card cardId="id">句子含 ==c1::被隐藏的文本==</mgo-card>',
            'cardId 是卡片的稳定身份——编辑卡片内容时靠它保留复习历史。',
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
