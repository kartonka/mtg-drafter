import type { BotStrategy, Card } from '../../shared/protocol';

const COLORS = ['W', 'U', 'B', 'R', 'G'];
/** Picks it takes this many cards to settle on colors. */
const COMMIT_START = 4;
const COMMIT_SPAN = 8;
const CANDIDATES = 3;
const TEMPERATURE = 0.1;
const COLORLESS_FIT = 0.7;
const OFF_COLOR_FIT = 0.25;

export function botPick(pack: Card[], pool: Card[], strategy: BotStrategy): Card {
    if (strategy === 'random') return pack[Math.floor(Math.random() * pack.length)];

    // Weight each color by the strength of the cards already taken in it.
    const weight = Object.fromEntries(COLORS.map((c) => [c, 0]));
    for (const card of pool) {
        for (const color of card.colors) weight[color] += (card.power + 0.5) / card.colors.length;
    }
    const ranked = COLORS.filter((c) => weight[c] > 0).sort((a, b) => weight[b] - weight[a]);
    const main = new Set(ranked.slice(0, 2));
    const top = weight[ranked[0]] ?? 1;

    // Early picks chase raw power; later picks increasingly stay in the main colors.
    const commitment = Math.min(1, Math.max(0, (pool.length - COMMIT_START) / COMMIT_SPAN));
    const colorFit = (card: Card) => {
        if (card.colors.length === 0) return COLORLESS_FIT;
        return Math.min(...card.colors.map((c) => (main.has(c) ? 1 : (OFF_COLOR_FIT * weight[c]) / top)));
    };
    const score = (card: Card) => card.power * (1 - commitment * (1 - colorFit(card)));

    // Choose among the best few, favouring the best, so bots are not predictable.
    const best = pack
        .map((card) => ({ card, score: score(card) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, CANDIDATES);
    const weights = best.map((b) => Math.exp((b.score - best[0].score) / TEMPERATURE));
    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < best.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return best[i].card;
    }
    return best[0].card;
}
