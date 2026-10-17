export interface Card {
    id: string;
    name: string;
    image: string;
    /** Back face image for transforming / double-faced cards, when available. */
    backImage?: string;
    /** Mana value of the front face. */
    cmc: number;
    /** Subset of W U B R G. */
    colors: string[];
    land: boolean;
    /** Scryfall type line, used for deck organization. */
    typeLine?: string;
    /** Rules text used to identify mechanics for the card preview helper. */
    oracleText?: string;
    backOracleText?: string;
    /** Scryfall's normalized keyword abilities/actions for this card. */
    keywords?: string[];
    /** Rough strength within its cube, 0 (weak) to 1 (strong). Used by bots. */
    power: number;
}

export type BotStrategy = 'random' | 'smart';
export type TimerStrategy = 'arena' | 'extended' | 'off';

export interface DraftSettings {
    packsPerPlayer: number;
    cardsPerPack: number;
    pickCount: number;
    botStrategy: BotStrategy;
    timerStrategy: TimerStrategy;
}

export type Phase = 'lobby' | 'drafting' | 'done';

export interface PlayerView {
    id: string;
    name: string;
    isBot: boolean;
    ready: boolean;
    connected: boolean;
    picks: number;
    waitingPacks: number;
}

export interface DraftView {
    round: number;
    totalRounds: number;
    pickNumber: number;
    /** Server-clock deadline for this player's current pick. */
    pickDeadline: number | null;
    /** 1 = packs go to the next seat in `players`, -1 = to the previous one. */
    direction: 1 | -1;
    pack: Card[] | null;
}

/** One pick and the pack the player chose from, retained for draft review. */
export interface DraftLogEntry {
    round: number;
    pick: number;
    direction: 1 | -1;
    pack: Card[];
    picked: Card;
    /** Other cards drafted in the same pick-two action. */
    alsoPicked?: Card[];
    /** Second card taken by using Cogwork Librarian for this pick. */
    additionalPicked?: Card;
}

export interface DraftReviewPlayer {
    id: string;
    name: string;
    isBot: boolean;
    picks: Card[];
    log: DraftLogEntry[];
    /** Optional so draft archives written before deck saving remain readable. */
    builtDeck?: DeckLayout;
}

export interface DeckLayout {
    columns: string[][];
    pool: string[];
}

export interface DraftReviewView {
    id: string;
    cubeName: string;
    /** ISO 8601 UTC time when drafting began. */
    startedAt: string;
    /** Optional because earlier archives did not include basic-land metadata. */
    basics?: Card[];
    players: DraftReviewPlayer[];
}

export interface TableView {
    id: string;
    phase: Phase;
    hostId: string;
    you: string;
    settings: DraftSettings;
    cube: { name: string; size: number; warnings: string[] };
    /** Basic lands available in unlimited quantity when building the deck. */
    basics: Card[];
    /** Seat order once the draft has started. */
    players: PlayerView[];
    draft: DraftView | null;
    picks: Card[];
    draftLog: DraftLogEntry[];
    /** Only filled for the host once the draft is done. */
    botPicks: { id: string; name: string; picks: Card[] }[];
}

export const LIMITS = {
    maxPlayers: 8,
    maxPacks: 6,
    minCardsPerPack: 3,
    maxCardsPerPack: 20,
    maxNameLength: 24,
} as const;

export type ClientMsg =
    | { t: 'create'; name: string; cube: { url?: string; text?: string } }
    | { t: 'createSaved'; name: string; cubeName: string }
    | { t: 'join'; tableId: string; name: string }
    | { t: 'resume'; tableId: string; token: string }
    | { t: 'review'; tableId: string }
    | { t: 'ready'; ready: boolean }
    | { t: 'addBot' }
    | { t: 'reorder'; playerIds: string[] }
    /** Lobby: removes the player. Drafting: hands the seat to a bot. */
    | { t: 'kick'; playerId: string }
    | { t: 'settings'; packsPerPlayer: number; cardsPerPack: number; pickCount: number; botStrategy: BotStrategy; timerStrategy: TimerStrategy }
    | { t: 'start' }
    | { t: 'pick'; cardIds: string[]; additionalCardId?: string }
    | { t: 'reservePick'; cardIds: string[]; additionalCardId?: string }
    | { t: 'saveDeck'; deck: DeckLayout }
    | { t: 'leave' };

export type ServerMsg =
    | { t: 'session'; tableId: string; token: string; playerId: string }
    | { t: 'state'; state: TableView }
    | { t: 'review'; review: DraftReviewView }
    | { t: 'error'; message: string; code?: 'NO_TABLE' };
