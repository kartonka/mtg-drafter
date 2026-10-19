import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { LIMITS, type Card, type DeckLayout, type DraftReviewView, type DraftSettings, type Phase, type TableView } from '../../shared/protocol';
import { botPick } from './bot';
import type { Cube } from './cube';
import { Draft, makePacks } from './draft';

export class GameError extends Error { }

export interface Player {
    id: string;
    token: string;
    name: string;
    isBot: boolean;
    ready: boolean;
    ws: WebSocket | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeTableCode(): string {
    return Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function cleanName(name: unknown): string {
    const n = typeof name === 'string' ? name.trim().slice(0, LIMITS.maxNameLength) : '';
    if (!n) throw new GameError('Enter a name.');
    return n;
}

const clamp = (n: unknown, min: number, max: number) => {
    const v = Math.floor(Number(n));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
};

export class Table {
    players: Player[] = [];
    hostId = '';
    phase: Phase = 'lobby';
    draft: Draft | null = null;
    startedAt: string | null = null;
    settings: DraftSettings = { packsPerPlayer: 3, cardsPerPack: 15, pickCount: 1, botStrategy: 'smart', timerStrategy: 'arena' };
    lastActive = Date.now();
    private readonly pickDeadlines = new Map<string, number>();
    private readonly reservedPicks = new Map<string, { cardIds: string[]; additionalCardId?: string }>();
    private readonly builtDecks = new Map<string, DeckLayout>();
    private botCount = 0;

    constructor(readonly id: string, readonly cube: Cube) { }

    addHuman(name: string, ws: WebSocket): Player {
        if (this.phase !== 'lobby') throw new GameError('The draft has already started.');
        this.ensureRoom();
        const player: Player = { id: randomUUID(), token: randomUUID(), name, isBot: false, ready: false, ws };
        this.players.push(player);
        if (!this.hostId) this.hostId = player.id;
        return player;
    }

    addBot(byId: string) {
        this.requireHost(byId);
        this.requireLobby();
        this.ensureRoom();
        this.players.push({
            id: randomUUID(),
            token: '',
            name: `Bot ${++this.botCount}`,
            isBot: true,
            ready: true,
            ws: null,
        });
    }

    reorderPlayers(byId: string, playerIds: unknown) {
        this.requireHost(byId);
        this.requireLobby();
        if (!Array.isArray(playerIds) || playerIds.length !== this.players.length) {
            throw new GameError('That seat order is invalid.');
        }
        const ids = playerIds.map(String);
        const playersById = new Map(this.players.map((player) => [player.id, player]));
        if (new Set(ids).size !== ids.length || ids.some((id) => !playersById.has(id))) {
            throw new GameError('That seat order is invalid.');
        }
        this.players = ids.map((id) => playersById.get(id)!);
    }

    setReady(playerId: string, ready: boolean) {
        this.requireLobby();
        const p = this.player(playerId);
        if (p) p.ready = !!ready;
    }

    setSettings(byId: string, packsPerPlayer: unknown, cardsPerPack: unknown, pickCount: unknown, botStrategy: unknown, timerStrategy: unknown) {
        this.requireHost(byId);
        this.requireLobby();
        this.settings = {
            packsPerPlayer: clamp(packsPerPlayer, 1, LIMITS.maxPacks),
            cardsPerPack: clamp(cardsPerPack, LIMITS.minCardsPerPack, LIMITS.maxCardsPerPack),
            pickCount: clamp(pickCount, 1, 2),
            botStrategy: botStrategy === 'random' ? 'random' : 'smart',
            timerStrategy: timerStrategy === 'extended' || timerStrategy === 'off' ? timerStrategy : 'arena',
        };
    }

    /** Lobby: removes the player. Drafting: a bot takes the seat over. */
    kick(byId: string, targetId: string) {
        this.requireHost(byId);
        if (targetId === byId) throw new GameError('You cannot remove yourself.');
        this.removeOrBotify(targetId);
    }

    leave(playerId: string) {
        this.removeOrBotify(playerId);
    }

    /** Returns true when no humans remain and the table should be discarded. */
    get abandoned() {
        return !this.players.some((p) => !p.isBot);
    }

    start(byId: string) {
        this.requireHost(byId);
        this.requireLobby();
        if (this.players.length < 2) throw new GameError('Add at least one more player or a bot.');
        if (!this.players.every((p) => p.ready)) throw new GameError('Everyone must be ready.');
        const { packsPerPlayer, cardsPerPack } = this.settings;
        const needed = this.players.length * packsPerPlayer * cardsPerPack;
        if (needed > this.cube.cards.length) {
            throw new GameError(`The cube has ${this.cube.cards.length} cards but ${needed} are needed. Reduce packs or pack size.`);
        }

        this.startedAt = new Date().toISOString();
        this.draft = new Draft(makePacks(this.cube.cards, this.players.length, packsPerPlayer, cardsPerPack), this.players.length, this.settings.pickCount);
        this.phase = 'drafting';
        this.advance();
    }

    pick(playerId: string, cardIds: string[], additionalCardId?: string) {
        if (this.phase !== 'drafting' || !this.draft) throw new GameError('No draft in progress.');
        const seat = this.players.findIndex((p) => p.id === playerId);
        if (seat < 0 || !this.draft.pick(seat, cardIds.map(String), additionalCardId === undefined ? undefined : String(additionalCardId))) {
            throw new GameError('That pick is not available.');
        }
        this.pickDeadlines.delete(playerId);
        this.reservedPicks.delete(playerId);
        this.advance();
    }

    reservePick(playerId: string, cardIds: string[], additionalCardId?: string) {
        if (this.phase !== 'drafting' || !this.draft) throw new GameError('No draft in progress.');
        const seat = this.players.findIndex((player) => player.id === playerId);
        const pack = seat >= 0 ? this.draft.currentPack(seat) : null;
        if (!pack) throw new GameError('That pick is no longer available.');
        const required = Math.min(this.settings.pickCount, pack.length);
        const ids = cardIds.map(String);
        if (ids.length > required || new Set(ids).size !== ids.length || ids.some((id) => !pack.some((card) => card.id === id))) {
            throw new GameError('That selection is no longer available.');
        }
        const extra = additionalCardId === undefined ? undefined : String(additionalCardId);
        if (extra && (
            ids.length !== required || pack.length <= required || ids.includes(extra) || !pack.some((card) => card.id === extra) ||
            !this.draft.picks[seat].some((card) => card.name.toLocaleLowerCase() === 'cogwork librarian')
        )) throw new GameError('Cogwork Librarian cannot be used for that selection.');
        if (ids.length === 0 && !extra) this.reservedPicks.delete(playerId);
        else this.reservedPicks.set(playerId, { cardIds: ids, ...(extra ? { additionalCardId: extra } : {}) });
    }

    pickTimedOut(playerId: string) {
        if (this.phase !== 'drafting' || !this.draft) return;
        const seat = this.players.findIndex((player) => player.id === playerId);
        const pack = seat >= 0 ? this.draft.currentPack(seat) : null;
        if (!pack) return;
        const required = Math.min(this.settings.pickCount, pack.length);
        const reserved = this.reservedPicks.get(playerId);
        const cardIds = (reserved?.cardIds ?? []).filter((id) => pack.some((card) => card.id === id));
        const available = pack.filter((card) => !cardIds.includes(card.id));
        while (cardIds.length < required && available.length > 0) {
            const [card] = available.splice(Math.floor(Math.random() * available.length), 1);
            cardIds.push(card.id);
        }
        const extra = reserved?.additionalCardId && pack.some((card) => card.id === reserved.additionalCardId)
            ? reserved.additionalCardId
            : undefined;
        this.pick(playerId, cardIds, extra);
    }

    setPickDeadline(playerId: string, deadline: number | null) {
        if (deadline === null) this.pickDeadlines.delete(playerId);
        else this.pickDeadlines.set(playerId, deadline);
    }

    saveDeck(playerId: string, value: unknown) {
        if (this.phase !== 'done' || !this.draft?.done) throw new GameError('You can save a deck after the draft is finished.');
        const seat = this.players.findIndex((player) => player.id === playerId && !player.isBot);
        if (seat < 0) throw new GameError('Only a player can save their drafted deck.');
        const deck = value as Partial<DeckLayout> | null;
        if (!deck || !Array.isArray(deck.columns) || !Array.isArray(deck.pool) || deck.columns.length > 100 || deck.pool.length > 2000) {
            throw new GameError('That deck layout is invalid.');
        }
        const columns = deck.columns.map((column) => {
            if (!Array.isArray(column) || column.length > 2000 || column.some((id) => typeof id !== 'string')) {
                throw new GameError('That deck layout is invalid.');
            }
            return [...column];
        });
        const pool = [...deck.pool];
        if (pool.some((id) => typeof id !== 'string')) throw new GameError('That deck layout is invalid.');
        const companion = typeof deck.companion === 'string' ? deck.companion : undefined;
        const ids = [...columns.flat(), ...pool, ...(companion ? [companion] : [])];
        if (ids.length > 2200 || new Set(ids).size !== ids.length) throw new GameError('That deck layout is invalid.');
        const drafted = new Set(this.draft!.picks[seat].map((card) => card.id));
        if (companion) {
            const card = this.draft!.picks[seat].find((picked) => picked.id === companion);
            if (!card || !/\bcompanion\b/i.test(card.oracleText ?? '')) throw new GameError('Only a drafted companion card can use the companion slot.');
        }
        const companionPicks = this.draft!.picks[seat].filter((card) => /\bcompanion\b/i.test(card.oracleText ?? ''));
        if (companionPicks.some((card) => columns.flat().includes(card.id) && card.id !== companion)) {
            throw new GameError('A companion card must use the companion slot.');
        }
        const basicPrefixes = this.cube.basics.map((card) => `b:${card.name}:`);
        const isBasicInstance = (id: string) => basicPrefixes.some((prefix) =>
            id.startsWith(prefix) && /^[a-z0-9]{1,6}$/i.test(id.slice(prefix.length))
        );
        if (ids.some((id) => !drafted.has(id) && !isBasicInstance(id))) {
            throw new GameError('That deck contains a card you did not draft.');
        }
        if ([...drafted].some((id) => !ids.includes(id))) throw new GameError('The saved layout must include all drafted cards.');
        this.builtDecks.set(playerId, { columns, pool, ...(companion ? { companion } : {}) });
    }

    player(id: string) {
        return this.players.find((p) => p.id === id);
    }

    view(playerId: string): TableView {
        const seat = this.players.findIndex((p) => p.id === playerId);
        const d = this.draft;
        const pack = d && seat >= 0 && !d.done ? d.currentPack(seat) : null;
        return {
            id: this.id,
            phase: this.phase,
            hostId: this.hostId,
            you: playerId,
            settings: this.settings,
            cube: { name: this.cube.name, size: this.cube.cards.length, warnings: this.cube.warnings },
            basics: this.cube.basics,
            players: this.players.map((p, i) => ({
                id: p.id,
                name: p.name,
                isBot: p.isBot,
                ready: p.ready,
                connected: p.isBot || p.ws !== null,
                picks: d ? d.picks[i].length : 0,
                waitingPacks: d && !d.done ? d.queues[i].length : 0,
            })),
            draft: d
                ? {
                    round: Math.min(d.round + 1, d.totalRounds),
                    totalRounds: d.totalRounds,
                    pickNumber: pack ? d.logs[seat].filter((entry) => entry.round === d.round + 1).length + 1 : 0,
                    pickDeadline: pack ? this.pickDeadlines.get(playerId) ?? null : null,
                    direction: d.direction,
                    pack,
                }
                : null,
            picks: d && seat >= 0 ? d.picks[seat] : [],
            draftLog: d && seat >= 0 ? d.logs[seat] : [],
            botPicks:
                d && this.phase === 'done' && playerId === this.hostId
                    ? this.players.flatMap((p, i) => (p.isBot ? [{ id: p.id, name: p.name, picks: d.picks[i] }] : []))
                    : [],
        };
    }

    reviewView(): DraftReviewView {
        const d = this.draft;
        if (!d || !d.done) throw new GameError('This draft is not finished yet.');
        return {
            id: this.id,
            cubeName: this.cube.name,
            startedAt: this.startedAt!,
            basics: this.cube.basics,
            players: this.players.map((player, seat) => ({
                id: player.id,
                name: player.name,
                isBot: player.isBot,
                picks: d.picks[seat],
                log: d.logs[seat],
                ...(this.builtDecks.has(player.id) ? { builtDeck: this.builtDecks.get(player.id)! } : {}),
            })),
        };
    }

    touch() {
        this.lastActive = Date.now();
    }

    private removeOrBotify(targetId: string) {
        const p = this.player(targetId);
        if (!p) return;
        if (this.phase === 'lobby') {
            this.players = this.players.filter((x) => x !== p);
        } else {
            p.isBot = true;
            p.ready = true;
            p.token = '';
            p.ws = null;
        }
        if (this.hostId === targetId) this.hostId = this.players.find((x) => !x.isBot)?.id ?? '';
        if (this.phase === 'drafting') this.advance();
    }

    private advance() {
        const d = this.draft;
        if (!d) return;
        let acted = true;
        while (acted && !d.done) {
            acted = false;
            this.players.forEach((p, seat) => {
                const pack = p.isBot ? d.currentPack(seat) : null;
                if (pack && !d.done) {
                    const count = Math.min(this.settings.pickCount, pack.length);
                    const selected: Card[] = [];
                    for (let i = 0; i < count; i++) {
                        const next = botPick(pack.filter((card) => !selected.some((chosen) => chosen.id === card.id)), [...d.picks[seat], ...selected], this.settings.botStrategy);
                        selected.push(next);
                    }
                    const hasLibrarian = d.picks[seat].some((card) => card.name.toLocaleLowerCase() === 'cogwork librarian');
                    const additional = hasLibrarian && pack.length > count
                        ? botPick(pack.filter((card) => !selected.some((chosen) => chosen.id === card.id)), [...d.picks[seat], ...selected], this.settings.botStrategy)
                        : undefined;
                    d.pick(seat, selected.map((card) => card.id), additional?.id);
                    acted = true;
                }
            });
        }
        if (d.done) this.phase = 'done';
    }

    private ensureRoom() {
        if (this.players.length >= LIMITS.maxPlayers) throw new GameError('The table is full.');
    }

    private requireHost(id: string) {
        if (id !== this.hostId) throw new GameError('Only the host can do that.');
    }

    private requireLobby() {
        if (this.phase !== 'lobby') throw new GameError('The draft has already started.');
    }
}
