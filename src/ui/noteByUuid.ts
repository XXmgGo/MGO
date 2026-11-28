import type { App, TFile } from 'obsidian';

/**
 * 通过笔记 frontmatter 里的 `UUID` 找文件。
 *
 * 卡片用 `analysisId:` 绑定详解笔记时，笔记改名、挪目录都不会断；
 * 第一次用到时把全库 UUID 扫一遍，之后靠 metadataCache 的事件增量更新。
 */
interface UuidCache {
    map: Map<string, TFile> | null;
}

const caches = new WeakMap<App, UuidCache>();

function uuidOf(app: App, file: TFile): string {
    const cache = app.metadataCache?.getFileCache?.(file);
    const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
    const raw = frontmatter?.UUID ?? frontmatter?.uuid;
    return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

function build(app: App): Map<string, TFile> {
    const map = new Map<string, TFile>();
    const files = app.vault?.getMarkdownFiles?.() ?? [];
    for (const file of files) {
        const uuid = uuidOf(app, file);
        if (uuid) map.set(uuid, file);
    }
    return map;
}

function ensure(app: App): Map<string, TFile> {
    let cache = caches.get(app);
    if (!cache) {
        cache = { map: null };
        caches.set(app, cache);
        const metadata = app.metadataCache;
        metadata?.on?.('changed', (file: TFile) => {
            const map = cache?.map;
            if (!map) return;
            for (const [key, value] of map) {
                if (value.path === file.path) map.delete(key);
            }
            const uuid = uuidOf(app, file);
            if (uuid) map.set(uuid, file);
        });
        metadata?.on?.('deleted', (file: TFile) => {
            const map = cache?.map;
            if (!map) return;
            for (const [key, value] of map) {
                if (value.path === file.path) map.delete(key);
            }
        });
        // 改名后 TFile 的 path 会变，直接丢掉索引，下次用到再建。
        app.vault?.on?.('rename', () => {
            if (cache) cache.map = null;
        });
    }
    if (!cache.map) cache.map = build(app);
    return cache.map;
}

export function resolveNoteByUuid(app: App, uuid: string): TFile | null {
    const key = uuid.trim().toLowerCase();
    if (!key) return null;
    return ensure(app).get(key) ?? null;
}