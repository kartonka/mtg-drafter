export interface Card {
    id: string;
    name: string;
    image: string;
    /** Mana value of the front face. */
    cmc: number;
    /** Subset of W U B R G. */
    colors: string[];
    land: boolean;
    /** Rough strength within its cube, 0 (weak) to 1 (strong). Used by bots. */
    power: number;
}

export type BotStrategy = 'random' | 'smart';

export interface DraftSettings {
    packsPerPlayer: number;
    cardsPerPack: number;
    botStrategy: BotStrategy;
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
}

export interface DraftReviewPlayer {
    id: string;
    name: string;
    isBot: boolean;
    picks: Card[];
    log: DraftLogEntry[];
}

export interface DraftReviewView {
    id: string;
    cubeName: string;
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
    | { t: 'join'; tableId: string; name: string }
    | { t: 'resume'; tableId: string; token: string }
    | { t: 'review'; tableId: string }
    | { t: 'ready'; ready: boolean }
    | { t: 'addBot' }
    /** Lobby: removes the player. Drafting: hands the seat to a bot. */
    | { t: 'kick'; playerId: string }
    | { t: 'settings'; packsPerPlayer: number; cardsPerPack: number; botStrategy: BotStrategy }
    | { t: 'start' }
    | { t: 'pick'; cardId: string }
    | { t: 'leave' };

export type ServerMsg =
    | { t: 'session'; tableId: string; token: string; playerId: string }
    | { t: 'state'; state: TableView }
    | { t: 'review'; review: DraftReviewView }
    | { t: 'error'; message: string; code?: 'NO_TABLE' };
