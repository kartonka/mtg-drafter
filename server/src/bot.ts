import type { BotStrategy, Card } from '../../shared/protocol';

const COLORS = ['W', 'U', 'B', 'R', 'G'];
/** Picks it takes this many cards to settle on colors. */
const COMMIT_START = 4;
const COMMIT_SPAN = 8;
const CANDIDATES = 3;
const TEMPERATURE = 0.1;
const COLORLESS_FIT = 0.7;
const OFF_COLOR_FIT = 0.25;

/**
 * Draftsim's top 50 from its Feb 2026 Vintage Cube pick order. Entries can be
 * absent from a particular draft's cube; they simply won't match any pack card.
 * A fixed bonus makes bots reliably take these cards before ordinary playables
 * while the existing color-fit score still guides picks after they're gone.
 */
const normalizeName = (name: string) => name.toLowerCase().replace(/\s*\/{1,2}\s*/g, ' // ').replace(/\s+/g, ' ').trim();

const CUBE_TOP_50 = [
    // 1–10
    'Black Lotus',
    'Ancestral Recall',
    'Time Walk',
    'Sol Ring',
    'Mox Sapphire',
    'Mox Ruby',
    'Mox Pearl',
    'Mox Jet',
    'Mox Emerald',
    'Tolarian Academy',
    // 11–20
    'Forth Eorlingas!',
    'Psychic Frog',
    'Mox Diamond',
    'Force of Will',
    'Ajani, Nacatl Pariah // Ajani, Nacatl Avenger',
    'Ocelot Pride',
    'Minsc & Boo, Timeless Heroes',
    'Mana Vault',
    'Timetwister',
    'The One Ring',
    // 21–30
    'Parallax Wave',
    'Library of Alexandria',
    'Karakas',
    'Flash',
    'Broadside Bombardiers',
    'Badgermole Cub',
    'Yawgmoth, Thran Physician',
    'Swords to Plowshares',
    'Orcish Bowmasters',
    'Guide of Souls',
    // 31–40
    'Phlage, Titan of Fire\'s Fury',
    'Mana Crypt',
    'Dismember',
    'Demonic Tutor',
    'Walking Ballista',
    'Spell Pierce',
    'Sheoldred, the Apocalypse',
    'Mana Drain',
    'Urza, Lord High Artificer',
    'Tinker',
    // 41–50
    'Thoughtseize',
    'Pyrogoyf',
    'Phelia, Exuberant Shepherd',
    'Mox Opal',
    'Flooded Strand',
    'Bonecrusher Giant // Stomp',
    'Ragavan, Nimble Pilferer',
    'Otharri, Suns\' Glory',
    'Laelia, the Blade Reforged',
    'Fury',
].map(normalizeName);

const TOP_50_RANK = new Map(CUBE_TOP_50.map((name, index) => [name, index + 1] as const));

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
    const score = (card: Card) => {
        const base = card.power * (1 - commitment * (1 - colorFit(card)));
        const rank = TOP_50_RANK.get(normalizeName(card.name));
        const premiumBonus = rank ? 1.05 + (CUBE_TOP_50.length - rank) * 0.02 : 0;
        return base + premiumBonus;
    };

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
