import type { Card, DraftLogEntry } from '../../shared/protocol';

export function shuffle<T>(items: readonly T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Cube draft: every card appears at most once across all packs. */
export function makePacks(cube: readonly Card[], seats: number, packsPerPlayer: number, cardsPerPack: number): Card[][][] {
    const deck = shuffle(cube);
    let next = 0;
    return Array.from({ length: packsPerPlayer }, () =>
        Array.from({ length: seats }, () => {
            const pack = deck.slice(next, next + cardsPerPack);
            next += cardsPerPack;
            return pack;
        }),
    );
}

/**
 * Seat-based draft. Each seat has a queue of packs waiting to be picked from,
 * so a fast player can pick ahead while a slow neighbour holds the pack up.
 */
export class Draft {
    readonly queues: Card[][][];
    readonly picks: Card[][];
    readonly logs: DraftLogEntry[][];
    round = 0;

    /** rounds[round][seat] is the pack that seat opens in that round. */
    constructor(private readonly rounds: Card[][][], private readonly seats: number) {
        this.queues = Array.from({ length: seats }, () => []);
        this.picks = Array.from({ length: seats }, () => []);
        this.logs = Array.from({ length: seats }, () => []);
        this.deal();
    }

    get totalRounds() {
        return this.rounds.length;
    }

    get done() {
        return this.round >= this.rounds.length;
    }

    get direction(): 1 | -1 {
        return this.round % 2 === 0 ? 1 : -1;
    }

    currentPack(seat: number): Card[] | null {
        return this.queues[seat][0] ?? null;
    }

    pick(seat: number, cardId: string): boolean {
        const pack = this.queues[seat][0];
        if (!pack) return false;
        const index = pack.findIndex((c) => c.id === cardId);
        if (index < 0) return false;

        const packSnapshot = [...pack];
        const [card] = pack.splice(index, 1);
        this.queues[seat].shift();
        this.logs[seat].push({
            round: this.round + 1,
            pick: this.picks[seat].length + 1,
            direction: this.direction,
            pack: packSnapshot,
            picked: card,
        });
        this.picks[seat].push(card);
        if (pack.length > 0) {
            this.queues[(seat + this.direction + this.seats) % this.seats].push(pack);
        }

        if (this.queues.every((q) => q.length === 0)) {
            this.round++;
            this.deal();
        }
        return true;
    }

    private deal() {
        if (this.done) return;
        this.rounds[this.round].forEach((pack, seat) => this.queues[seat].push(pack));
    }
}
