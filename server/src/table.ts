import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { LIMITS, type DraftSettings, type Phase, type TableView } from '../../shared/protocol';
import { botPick } from './bot';
import type { Cube } from './cube';
import { Draft, makePacks, shuffle } from './draft';

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
    settings: DraftSettings = { packsPerPlayer: 3, cardsPerPack: 15, botStrategy: 'smart' };
    lastActive = Date.now();
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

    setReady(playerId: string, ready: boolean) {
        this.requireLobby();
        const p = this.player(playerId);
        if (p) p.ready = !!ready;
    }

    setSettings(byId: string, packsPerPlayer: unknown, cardsPerPack: unknown, botStrategy: unknown) {
        this.requireHost(byId);
        this.requireLobby();
        this.settings = {
            packsPerPlayer: clamp(packsPerPlayer, 1, LIMITS.maxPacks),
            cardsPerPack: clamp(cardsPerPack, LIMITS.minCardsPerPack, LIMITS.maxCardsPerPack),
            botStrategy: botStrategy === 'random' ? 'random' : 'smart',
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

        this.players = shuffle(this.players);
        this.draft = new Draft(makePacks(this.cube.cards, this.players.length, packsPerPlayer, cardsPerPack), this.players.length);
        this.phase = 'drafting';
        this.advance();
    }

    pick(playerId: string, cardId: string) {
        if (this.phase !== 'drafting' || !this.draft) throw new GameError('No draft in progress.');
        const seat = this.players.findIndex((p) => p.id === playerId);
        if (seat < 0 || !this.draft.pick(seat, String(cardId))) throw new GameError('That pick is not available.');
        this.advance();
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
                    pickNumber: pack ? this.settings.cardsPerPack - pack.length + 1 : 0,
                    direction: d.direction,
                    pack,
                }
                : null,
            picks: d && seat >= 0 ? d.picks[seat] : [],
            botPicks:
                d && this.phase === 'done' && playerId === this.hostId
                    ? this.players.flatMap((p, i) => (p.isBot ? [{ id: p.id, name: p.name, picks: d.picks[i] }] : []))
                    : [],
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
            p.name = `${p.name} (bot)`;
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
                    d.pick(seat, botPick(pack, d.picks[seat], this.settings.botStrategy).id);
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
