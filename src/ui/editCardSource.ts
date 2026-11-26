import { App, MarkdownView, TFile } from 'obsidian';

/**
 * 在编辑器里定位到某张卡片的代码围栏并把光标放进去（实时预览会切换成可编辑的源码）。
 * 优先复用已打开该笔记的源码模式标签页；只有阅读视图时把它切到源码模式；都没有就新开一个。
 */
export async function editCardAtSource(app: App, sourcePath: string, lang: string, source: string): Promise<boolean> {
    const head = '```' + lang + '\n';
    const fence = head + source + '\n```';

    const place = (view: MarkdownView): boolean => {
        const editor = view.editor;
        const idx = editor.getValue().indexOf(fence);
        if (idx < 0) return false;
        const pos = editor.offsetToPos(idx + head.length);
        editor.setCursor(pos);
        editor.scrollIntoView({ from: pos, to: pos }, true);
        editor.focus();
        return true;
    };

    const sameFile = app.workspace.getLeavesOfType('markdown').filter((leaf) => {
        const view = leaf.view;
        return view instanceof MarkdownView && view.file?.path === sourcePath;
    });

    for (const leaf of sameFile) {
        const view = leaf.view as MarkdownView;
        if (view.getMode() === 'source') {
            app.workspace.setActiveLeaf(leaf, { focus: true });
            if (place(view)) return true;
        }
    }

    const existing = sameFile[0];
    if (existing) {
        await existing.setViewState({ type: 'markdown', state: { file: sourcePath, mode: 'source' }, active: true });
        if (existing.view instanceof MarkdownView && place(existing.view)) return true;
    }

    const file = app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) return false;
    const leaf = app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: 'markdown', state: { file: sourcePath, mode: 'source' }, active: true });
    if (leaf.view instanceof MarkdownView) return place(leaf.view);
    return false;
}