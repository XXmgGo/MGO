import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { normalizeVaultPath, resolveAudioSrc } from '../src/ui/audioSrc';

function appWithResourcePath(resource = 'app://local/x.mp3', throwOn?: string): App {
    return {
        vault: {
            adapter: {
                getResourcePath(path: string) {
                    if (throwOn && path === throwOn) throw new Error('boom');
                    return `${resource}?${path}`;
                },
            },
        },
    } as unknown as App;
}

describe('normalizeVaultPath', () => {
    it('去掉 ./ 前缀和重复斜杠', () => {
        expect(normalizeVaultPath('./_resource//a.mp3')).toBe('_resource/a.mp3');
        expect(normalizeVaultPath('_resource\\a.mp3')).toBe('_resource/a.mp3');
    });
});

describe('resolveAudioSrc', () => {
    it('外链原样返回', () => {
        expect(resolveAudioSrc(appWithResourcePath(), 'https://obsidian.example/a.mp3')).toBe('https://obsidian.example/a.mp3');
        expect(resolveAudioSrc(appWithResourcePath(), 'app://abc/a.mp3')).toBe('app://abc/a.mp3');
    });

    it('vault: 前缀和裸路径都换成资源地址', () => {
        const app = appWithResourcePath();
        expect(resolveAudioSrc(app, 'vault:_resource/a.mp3')).toBe('app://local/x.mp3?_resource/a.mp3');
        expect(resolveAudioSrc(app, '_resource/a.mp3')).toBe('app://local/x.mp3?_resource/a.mp3');
        expect(resolveAudioSrc(app, ' vault:_resource/./b.mp3 ')).toBe('app://local/x.mp3?_resource/b.mp3');
    });

    it('空值和无法解析的情形返回空串', () => {
        expect(resolveAudioSrc(appWithResourcePath(), '')).toBe('');
        expect(resolveAudioSrc(appWithResourcePath(), '   ')).toBe('');
        expect(resolveAudioSrc(null, 'vault:_resource/a.mp3')).toBe('');
        expect(resolveAudioSrc(appWithResourcePath('x', '_resource/bad.mp3'), 'vault:_resource/bad.mp3')).toBe('');
    });
});