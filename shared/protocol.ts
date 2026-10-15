export interface Card {
    id: string;
    name: string;
    image: string;
}

export interface DraftSettings {
    packsPerPlayer: number;
    cardsPerPack: number;
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

export interface TableView {
    id: string;
    phase: Phase;
    hostId: string;
    you: string;
    settings: DraftSettings;
    cube: { name: string; size: number; warnings: string[] };
    /** Seat order once the draft has started. */
    players: PlayerView[];
    draft: DraftView | null;
    picks: Card[];
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
    | { t: 'ready'; ready: boolean }
    | { t: 'addBot' }
    /** Lobby: removes the player. Drafting: hands the seat to a bot. */
    | { t: 'kick'; playerId: string }
    | { t: 'settings'; packsPerPlayer: number; cardsPerPack: number }
    | { t: 'start' }
    | { t: 'pick'; cardId: string }
    | { t: 'leave' };

export type ServerMsg =
    | { t: 'session'; tableId: string; token: string; playerId: string }
    | { t: 'state'; state: TableView }
    | { t: 'error'; message: string; code?: 'NO_TABLE' };
