import type { App } from 'obsidian';

const VAULT_PREFIX = 'vault:';
const DIRECT_SRC_RE = /^(?:https?|app|data|blob|file):/i;

/** 去掉 `vault:` 前缀、`./`、重复斜杠，得到 vault 内相对路径。 */
export function normalizeVaultPath(value: string): string {
    return value
        .replace(/\\/g, '/')
        .replace(/\/\.\//g, '/')
        .replace(/^\.\//, '')
        .replace(/\/{2,}/g, '/')
        .trim();
}

/**
 * 解析 `audio:` 属性。
 * - `https://…` / `app://…` / `data:` 等可直接播放的地址，原样返回；
 * - 其余按 vault 内路径处理（`vault:_resource/x.mp3` 或 `_resource/x.mp3`），
 *   用 `adapter.getResourcePath` 换成当前设备可播放的资源地址；
 * - 为空或无法解析时返回空串，调用方据此隐藏语音按钮。
 */
export function resolveAudioSrc(app: App | null | undefined, raw: string | undefined): string {
    const value = (raw ?? '').trim();
    if (!value) return '';
    if (DIRECT_SRC_RE.test(value)) return value;
    const path = normalizeVaultPath(value.startsWith(VAULT_PREFIX) ? value.slice(VAULT_PREFIX.length) : value);
    if (!path) return '';
    const adapter = app?.vault?.adapter as { getResourcePath?: (p: string) => string } | undefined;
    if (typeof adapter?.getResourcePath !== 'function') return '';
    try {
        return adapter.getResourcePath(path);
    } catch {
        return '';
    }
}