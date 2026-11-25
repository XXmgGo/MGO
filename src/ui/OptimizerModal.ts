import { App, Modal, Notice, Setting } from 'obsidian';
import { buildSequences, computeLossForWeights, optimize, type OptimizerResult } from '../data/FsrsOptimizer';

type FSRSFlashcardsPlugin = import('../plugin/main').FSRSFlashcardsPlugin;

export class OptimizerModal extends Modal {
    private plugin: FSRSFlashcardsPlugin;
    private result: OptimizerResult | null = null;
    private isRunning = false;
    private currentWeights: readonly number[];

    constructor(app: App, plugin: FSRSFlashcardsPlugin) {
        super(app);
        this.plugin = plugin;
        this.currentWeights = plugin.settings.fsrsParams.w;
    }

    onOpen() {
        this.contentEl.empty();
        this.titleEl.setText('FSRS 权重优化器');
        this.containerEl.addClass('fsrs-optimizer-modal');

        const reviewHistory = this.plugin.dataManager.getReviewHistory();
        const sequences = buildSequences(reviewHistory);
        const totalReviews = reviewHistory.length;
        const cardsWithHistory = sequences.length;
        const avgReviewsPerCard = cardsWithHistory > 0
            ? (totalReviews / cardsWithHistory).toFixed(1)
            : '0';

        const overviewEl = this.contentEl.createDiv({ cls: 'fsrs-optimizer-overview' });
        overviewEl.createEl('p', {
            text: `样本数据：${cardsWithHistory} 张卡片共 ${totalReviews} 次复习（平均每张 ${avgReviewsPerCard} 次）`,
        });
        overviewEl.createEl('p', {
            text: cardsWithHistory < 5
                ? '至少需要 5 张有复习记录的卡片才能进行优化。'
                : '优化器会调整 19 个 FSRS 权重以匹配你的记忆规律，这可能需要几秒钟。',
            cls: cardsWithHistory < 5 ? 'mod-warning' : '',
        });

        const weightsContainer = this.contentEl.createDiv({ cls: 'fsrs-optimizer-weights' });
        weightsContainer.createEl('h4', { text: '当前权重' });
        this.renderWeightTable(weightsContainer, this.currentWeights);

        const resultContainer = this.contentEl.createDiv({ cls: 'fsrs-optimizer-result' });
        resultContainer.hide();

        const statusEl = this.contentEl.createDiv({ cls: 'fsrs-optimizer-status' });

        const actionsEl = this.contentEl.createDiv({ cls: 'fsrs-optimizer-actions' });

        new Setting(actionsEl)
            .addButton(btn => btn
                .setButtonText('开始优化')
                .setCta()
                .setDisabled(cardsWithHistory < 5 || this.isRunning)
                .onClick(() => this.runOptimization(sequences, resultContainer, statusEl, weightsContainer)))
            .addButton(btn => btn
                .setButtonText('取消')
                .onClick(() => this.close()));
    }

    private renderWeightTable(container: HTMLElement, weights: readonly number[]) {
        const table = container.createEl('table', { cls: 'fsrs-optimizer-table' });
        const headerRow = table.createEl('tr');
        headerRow.createEl('th', { text: '序号' });
        headerRow.createEl('th', { text: '数值' });

        for (let i = 0; i < weights.length; i++) {
            const row = table.createEl('tr');
            row.createEl('td', { text: `w[${i}]` });
            row.createEl('td', { text: weights[i].toFixed(4) });
        }
    }

    private async runOptimization(
        sequences: ReturnType<typeof buildSequences>,
        resultContainer: HTMLElement,
        statusEl: HTMLElement,
        weightsContainer: HTMLElement,
    ) {
        this.isRunning = true;
        statusEl.setText('正在运行优化……');
        statusEl.addClass('fsrs-optimizer-status-running');

        const { request_retention, maximum_interval } = this.plugin.settings.fsrsParams;

        await new Promise(resolve => window.setTimeout(resolve, 50));

        try {
            const onProgress = (r: OptimizerResult) => {
                statusEl.setText(`第 ${r.epoch}/30 轮 — 损失值：${r.loss.toFixed(4)}`);
            };

            this.result = optimize(sequences, this.currentWeights, request_retention, maximum_interval, {
                populationSize: 20,
                generations: 30,
                mutationRate: 0.8,
                gamma: 0.01,
                onProgress,
            });

            this.showResults(resultContainer, statusEl);
        } catch (error) {
            statusEl.setText(`优化失败：${error}`);
            statusEl.removeClass('fsrs-optimizer-status-running');
            statusEl.addClass('mod-warning');
        } finally {
            this.isRunning = false;
        }
    }

    private showResults(
        resultContainer: HTMLElement,
        statusEl: HTMLElement,
    ) {
        if (!this.result) return;

        statusEl.setText(`完成！最终损失值：${this.result.loss.toFixed(4)}`);
        statusEl.removeClass('fsrs-optimizer-status-running');

        resultContainer.empty();
        resultContainer.show();

        resultContainer.createEl('h4', { text: '优化后的权重' });
        this.renderWeightTable(resultContainer, this.result.weights);

        // Compute current loss for comparison
        const reviewHistory = this.plugin.dataManager.getReviewHistory();
        const sequences = buildSequences(reviewHistory);
        const { request_retention, maximum_interval } = this.plugin.settings.fsrsParams;
        const currentLoss = sequences.length >= 5
            ? computeLossForWeights([...this.currentWeights], sequences, request_retention, maximum_interval, 0.01)
            : null;

        if (currentLoss !== null) {
            const comparisonContainer = resultContainer.createDiv({ cls: 'fsrs-optimizer-comparison' });
            comparisonContainer.createEl('h4', { text: '对比' });
            comparisonContainer.createEl('p', {
                text: `当前权重的损失值：${currentLoss.toFixed(4)} → 优化后：${this.result.loss.toFixed(4)}`,
            });
            const improvement = ((currentLoss - this.result.loss) / currentLoss * 100).toFixed(1);
            comparisonContainer.createEl('p', {
                text: `改善幅度：${improvement}%`,
                cls: parseFloat(improvement) > 0 ? 'fsrs-optimizer-positive' : '',
            });
        }

        new Setting(this.contentEl)
            .addButton(btn => btn
                .setButtonText('应用权重')
                .setCta()
                .onClick(async () => {
                    if (!this.result) return;
                    this.plugin.settings.fsrsParams.w = [...this.result.weights];
                    await this.plugin.saveSettings();
                    this.plugin.dataManager.updateFsrsParameters(this.plugin.settings.fsrsParams);
                    new Notice('优化后的 FSRS 权重已应用！');
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('放弃')
                .onClick(() => this.close()));
    }

    onClose() {
        this.contentEl.empty();
    }
}
