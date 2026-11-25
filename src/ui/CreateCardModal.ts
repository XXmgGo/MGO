import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import { generateBlockId } from '../data/constants';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

type CardTypeOption = 'basic' | 'single' | 'reversed' | 'cloze' | 'occlusion' | 'typein';

export class CreateCardModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private cardType: CardTypeOption = 'basic';
    private frontText = '';
    private backText = '';
    private clozeText = '';
    private targetFile: TFile | null = null;
    private previewEl: HTMLElement | null = null;

    constructor(app: App, plugin: FSRSFlashcardsPlugin, defaultFile?: TFile) {
        super(app);
        this.plugin = plugin;
        this.targetFile = defaultFile || this.app.workspace.getActiveFile() || null;
    }

    onOpen() {
        this.titleEl.setText('新建闪卡');
        this.modalEl.addClass('fsrs-create-card-modal');
        this.renderForm();

        this.scope.register(['Mod'], 'Enter', () => void this.handleInsert());
    }

    onClose() {
        this.contentEl.empty();
    }

    private renderForm() {
        this.contentEl.empty();
        const container = this.contentEl.createDiv({ cls: 'fsrs-create-card-container' });

        const markdownFiles = this.app.vault.getMarkdownFiles();
        if (!this.targetFile && markdownFiles.length > 0) {
            this.targetFile = markdownFiles[0];
        }

        new Setting(container)
            .setName('牌组笔记')
            .setDesc('这张闪卡将存入的笔记')
            .addDropdown(dd => {
                for (const f of markdownFiles) {
                    dd.addOption(f.path, f.basename);
                }
                if (this.targetFile) {
                    dd.setValue(this.targetFile.path);
                }
                dd.onChange(path => {
                    const found = this.app.vault.getAbstractFileByPath(path);
                    if (found instanceof TFile) {
                        this.targetFile = found;
                    }
                });
            });

        new Setting(container)
            .setName('卡片类型')
            .setDesc('格式与复习方式')
            .addDropdown(dd => {
                dd.addOption('basic', '基础（多行问题与答案）');
                dd.addOption('single', '紧凑（标签内单行）');
                dd.addOption('reversed', '反向（双向回忆）');
                dd.addOption('cloze', '填空（句中挖空）');
                dd.addOption('occlusion', '图形遮罩（原地切换图片）');
                dd.addOption('typein', '输入作答（手动键入答案）');
                dd.setValue(this.cardType);
                dd.onChange(val => {
                    this.cardType = val as CardTypeOption;
                    this.renderForm();
                });
            });

        const inputsSection = container.createDiv({ cls: 'fsrs-card-inputs-section' });

        if (this.cardType === 'cloze') {
            new Setting(inputsSection)
                .setName('填空句子')
                .setDesc('使用 ==c1::文本== 语法包裹需要隐藏的词')
                .addTextArea(ta => {
                    ta.setPlaceholder('例如：==c1::线粒体== 是细胞的 ==c2::动力工厂==。')
                        .setValue(this.clozeText)
                        .onChange(val => {
                            this.clozeText = val;
                            this.updatePreview();
                        });
                    ta.inputEl.rows = 4;
                    ta.inputEl.addClass('fsrs-modal-textarea');
                });
        } else if (this.cardType === 'occlusion') {
            new Setting(inputsSection)
                .setName('遮罩图（问题）')
                .setDesc('指向已遮盖图片的 wiki 链接或 Markdown 嵌入')
                .addText(text => {
                    text.setPlaceholder('![[diagram-masked.png]]')
                        .setValue(this.frontText)
                        .onChange(val => {
                            this.frontText = val;
                            this.updatePreview();
                        });
                    text.inputEl.addClass('fsrs-modal-input-wide');
                });

            new Setting(inputsSection)
                .setName('完整图（答案）')
                .setDesc('指向未遮盖图片的 wiki 链接或 Markdown 嵌入')
                .addText(text => {
                    text.setPlaceholder('![[diagram-unmasked.png]]')
                        .setValue(this.backText)
                        .onChange(val => {
                            this.backText = val;
                            this.updatePreview();
                        });
                    text.inputEl.addClass('fsrs-modal-input-wide');
                });
        } else {
            const isSingle = this.cardType === 'single' || this.cardType === 'reversed';
            new Setting(inputsSection)
                .setName('正面 / 问题')
                .setDesc('复习时显示的题目')
                .addTextArea(ta => {
                    ta.setPlaceholder('输入问题或提示……')
                        .setValue(this.frontText)
                        .onChange(val => {
                            this.frontText = val;
                            this.updatePreview();
                        });
                    ta.inputEl.rows = isSingle ? 2 : 4;
                    ta.inputEl.addClass('fsrs-modal-textarea');
                });

            new Setting(inputsSection)
                .setName('背面 / 答案')
                .setDesc('点击显示答案后呈现的内容')
                .addTextArea(ta => {
                    ta.setPlaceholder('输入答案或解释……')
                        .setValue(this.backText)
                        .onChange(val => {
                            this.backText = val;
                            this.updatePreview();
                        });
                    ta.inputEl.rows = isSingle ? 2 : 4;
                    ta.inputEl.addClass('fsrs-modal-textarea');
                });
        }

        const previewContainer = container.createDiv({ cls: 'fsrs-card-preview-container' });
        previewContainer.createDiv({ text: 'Markdown 预览', cls: 'fsrs-preview-heading' });
        this.previewEl = previewContainer.createEl('pre', { cls: 'fsrs-card-preview-code' });
        this.updatePreview();

        new Setting(container)
            .addButton(btn => btn
                .setButtonText('取消')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText('插入卡片')
                .setCta()
                .onClick(() => void this.handleInsert()));
    }

    private generateCardMarkdown(): string {
        const cardId = generateBlockId();

        if (this.cardType === 'cloze') {
            const clean = this.clozeText.trim() || 'Sentence with ==c1::cloze==.';
            return `\n<mgo-card cardId="${cardId}">\n${clean}\n</mgo-card>\n`;
        }

        if (this.cardType === 'occlusion') {
            const q = this.frontText.trim() || '![[diagram-question.png]]';
            const a = this.backText.trim() || '![[diagram-answer.png]]';
            return `\n<mgo-card cardId="${cardId}">\n${q}\n<mgo-a>${a}</mgo-a>\n</mgo-card>\n`;
        }

        if (this.cardType === 'single') {
            const q = this.frontText.trim().replace(/\n+/g, ' ') || 'Question';
            const a = this.backText.trim().replace(/\n+/g, ' ') || 'Answer';
            return `\n<mgo-card cardId="${cardId}">${q}<mgo-a>${a}</mgo-a></mgo-card>\n`;
        }

        if (this.cardType === 'reversed') {
            const q = this.frontText.trim().replace(/\n+/g, ' ') || 'Question';
            const a = this.backText.trim().replace(/\n+/g, ' ') || 'Answer';
            return `\n<mgo-card cardId="${cardId}" reverse>${q}<mgo-a>${a}</mgo-a></mgo-card>\n`;
        }

        if (this.cardType === 'typein') {
            const q = this.frontText.trim() || 'Question';
            const a = this.backText.trim() || 'Answer';
            return `\n<mgo-card cardId="${cardId}" type="typein">\n${q}\n<mgo-a>${a}</mgo-a>\n</mgo-card>\n`;
        }

        const q = this.frontText.trim() || 'Question';
        const a = this.backText.trim() || 'Answer';
        return `\n<mgo-card cardId="${cardId}">\n${q}\n<mgo-a>${a}</mgo-a>\n</mgo-card>\n`;
    }

    private updatePreview() {
        if (!this.previewEl) return;
        this.previewEl.setText(this.generateCardMarkdown().trim());
    }

    private async handleInsert() {
        if (!this.targetFile) {
            new Notice('请先选择目标笔记。');
            return;
        }

        if (this.cardType === 'cloze' && !this.clozeText.trim()) {
            new Notice('请输入填空句子。');
            return;
        }

        if (this.cardType !== 'cloze' && (!this.frontText.trim() || !this.backText.trim())) {
            new Notice('请同时填写问题与答案。');
            return;
        }

        const cardMarkdown = this.generateCardMarkdown();

        await this.plugin.dataManager.ensureDeckTag(this.targetFile);

        const activeFile = this.app.workspace.getActiveFile();
        const activeEditor = this.app.workspace.activeEditor?.editor;

        if (activeFile && activeFile.path === this.targetFile.path && activeEditor) {
            const cursor = activeEditor.getCursor();
            activeEditor.replaceRange(`\n${cardMarkdown}\n`, cursor);
        } else {
            await this.app.vault.process(this.targetFile, (existing) => `${existing.trimEnd()}\n\n${cardMarkdown}\n`);
        }

        new Notice(`已添加卡片到 ${this.targetFile.basename}`);
        this.close();
        this.plugin.refreshDashboardView();
    }
}
