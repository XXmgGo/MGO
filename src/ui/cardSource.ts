import { App, MarkdownView, Notice, TFile } from 'obsidian';
import type { Card } from '../data/types';

/**
 * 打开卡片所在的原文笔记，并滚动到卡片块的位置。
 * 已有同笔记的标签页时优先复用，否则新开一个标签页；当前视图不受影响。
 */
export async function openCardSource(app: App, card: Card): Promise<void> {
    const existing = app.workspace.getLeavesOfType('markdown').find((leaf) => {
        const view = leaf.view;
        return view instanceof MarkdownView && view.file?.path === card.filePath;
    });

    let leaf = existing ?? null;
    if (!leaf) {
        const file = app.vault.getAbstractFileByPath(card.filePath);
        if (!(file instanceof TFile)) {
            new Notice('找不到这张卡片的原文笔记。');
            return;
        }
        leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(file);
    } else {
        app.workspace.setActiveLeaf(leaf, { focus: true });
    }

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const editor = view.editor;
    const content = editor.getValue();
    const needle = card.originalText?.trim() ? card.originalText : card.front;
    const idx = content.indexOf(needle);
    if (idx < 0) return;
    const from = editor.offsetToPos(idx);
    const to = editor.offsetToPos(idx + needle.length);
    editor.setCursor(from);
    editor.scrollIntoView({ from, to }, true);
}