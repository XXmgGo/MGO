import type { Card as FSRSCard, Rating } from 'ts-fsrs';

export interface FSRSParameters {
    request_retention: number;
    maximum_interval: number;
    w: readonly number[];
}

export interface Gamification {
    currentStreak: number;
    longestStreak: number;
    lastReviewDate: string;
    totalXp: number;
    mostReviewsInDay: number;
    totalCardsReviewed: number;
}

export interface FSRSSettings {
    deckTags: string[];
    newCardsPerDay: number;
    reviewsPerDay: number;
    fontSize: number;
    fsrsParams: FSRSParameters;
    syncEnabled: boolean;
    syncUrl: string;
    syncDbName: string;
    syncUsername: string;
    syncPassword: string;
    usePouchDB: boolean;
    databaseName?: string;
    burySiblings?: boolean;
    leechThreshold?: number;
    gamification: Gamification;
}

export type CardType = 'basic' | 'cloze' | 'reversed' | 'typein';

export interface CardData {
    id: string;
    deckId: string;
    filePath: string;
    type: CardType;
    originalText: string;
    front: string;
    back: string;
    context?: string;
    /** 卡片属性头里的 title（UI 显示名）。 */
    title?: string;
    /** 选择题候选项；与 answer 同时存在时，复习界面渲染成可点的选择题。 */
    options?: string[];
    /** 选择题正确答案：1 起始序号、A–J 字母，或选项原文。 */
    answer?: string;
    /** 回忆提示，显示在正面下方。 */
    hint?: string;
    /** 语音地址（卡片属性 audio）：复习、浏览界面的小喇叭播放它。 */
    audio?: string;
}

export type FSRSData = FSRSCard;

export interface Card extends CardData {
    fsrsData?: FSRSData;
}

export interface DeckSettings {
    newCardsPerDay?: number;
    reviewsPerDay?: number;
    requestRetention?: number;
}

export interface Deck {
    id: string;
    title: string;
    tagPath: string;
    filePath: string;
    cardIds: Set<string>;
    stats: { new: number; due: number; learning: number };
    settings?: DeckSettings;
}

export interface NoteReviewData {
    filePath: string;
    fsrsData?: FSRSData;
}

export interface ReviewLog {
    cardId: string;
    timestamp: number;
    rating: Rating;
}

export interface PluginData {
    settings: FSRSSettings;
    cardData: Record<string, FSRSData>;
    reviewHistory: ReviewLog[];
}
