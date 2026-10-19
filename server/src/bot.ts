import type { BotStrategy, Card } from '../../shared/protocol';

const COLORS = ['W', 'U', 'B', 'R', 'G'];
/** Picks it takes this many cards to settle on colors. */
const COMMIT_START = 4;
const COMMIT_SPAN = 8;
const CANDIDATES = 3;
const TEMPERATURE = 0.1;
const COLORLESS_FIT = 0.55;

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

const BASIC_LAND_COLORS: Record<string, string> = {
    plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G',
};

function manaColors(card: Card): string[] {
    const known = card.producedMana?.filter((mana) => COLORS.includes(mana)) ?? [];
    if (known.length) return [...new Set(known)];

    const text = card.oracleText ?? '';
    const found = new Set<string>();
    if (/\badd\b[^.\n]*\bany color\b/i.test(text) || /\badd\b[^.\n]*\bone mana of the chosen color\b/i.test(text)) {
        return [...COLORS];
    }
    for (const match of text.matchAll(/\badd\b([^.!?\n]*)/gi)) {
        for (const symbol of match[1].matchAll(/\{([WUBRG])\}/gi)) found.add(symbol[1].toUpperCase());
    }

    // Fetch lands produce the colors of the basic land types they can find.
    if (card.land && /\bsearch your library for\b/i.test(text)) {
        if (/\bbasic land card\b/i.test(text)) COLORS.forEach((color) => found.add(color));
        for (const [basic, color] of Object.entries(BASIC_LAND_COLORS)) {
            if (new RegExp(`\\b${basic}\\b`, 'i').test(text)) found.add(color);
        }
    }
    return [...found];
}

const isArtifact = (card: Card) => /\bArtifact\b/i.test(card.typeLine ?? '');
const hasArtifactPayoff = (card: Card) => /\b(?:artifact|improvise|metalcraft|affinity)\b/i.test(card.oracleText ?? '') ||
    (card.keywords ?? []).some((keyword) => /^(improvise|metalcraft)$/i.test(keyword));

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
    const artifactCount = pool.filter(isArtifact).length;
    const artifactShare = artifactCount / Math.max(1, pool.length);
    const artifactPayoffs = pool.filter(hasArtifactPayoff).length;

    // Early picks chase raw power; later picks increasingly stay in the main colors.
    const commitment = Math.min(1, Math.max(0, (pool.length - COMMIT_START) / COMMIT_SPAN));
    const colorFit = (colors: string[]) => {
        if (colors.length === 0) return COLORLESS_FIT;
        // Gold cards remain plausible when one color is established and the
        // other is still open; averaging avoids the old all-colors-must-fit trap.
        return colors.reduce((sum, color) => {
            if (main.has(color)) return sum + 1;
            const relativeWeight = Math.min(1, (weight[color] ?? 0) / top);
            return sum + 0.4 + relativeWeight * 0.25;
        }, 0) / colors.length;
    };
    const score = (card: Card) => {
        const mana = card.land ? manaColors(card) : [];
        const colors = card.land ? mana : card.colors;
        const fit = colorFit(colors);
        const base = card.power * (1 - commitment * (1 - fit));
        const rank = TOP_50_RANK.get(normalizeName(card.name));
        const premiumBonus = rank ? 1.05 + (CUBE_TOP_50.length - rank) * 0.02 : 0;
        const matchedLandColors = mana.filter((color) => main.has(color)).length;
        const landFixingBonus = card.land && mana.length > 1
            ? main.size === 0 ? 0.05 : matchedLandColors > 0 ? 0.08 + (matchedLandColors > 1 ? 0.04 : 0) : 0
            : card.land && matchedLandColors > 0 ? 0.06 : 0;
        // Colorless artifacts are useful, but shouldn't remain an effortless
        // default once the pool is already artifact-heavy. Artifact payoffs
        // soften the penalty to permit coherent artifact decks.
        const densityPenalty = Math.min(0.3, Math.max(0, artifactShare - 0.3) * 0.6) * Math.min(1, pool.length / 6);
        const synergyRelief = Math.max(0.35, 1 - artifactPayoffs * 0.12);
        const candidateRelief = hasArtifactPayoff(card) ? 0.5 : 1;
        const artifactBalance = isArtifact(card) ? 1 - densityPenalty * synergyRelief * candidateRelief : 1;
        return (base + premiumBonus + landFixingBonus) * artifactBalance;
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
