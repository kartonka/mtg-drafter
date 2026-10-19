import type { BotStrategy, Card } from '../../shared/protocol';

const COLORS = ['W', 'U', 'B', 'R', 'G'];
/** Picks it takes this many cards to settle on colors. */
const COMMIT_START = 4;
const COMMIT_SPAN = 8;
const CANDIDATES = 3;
const TEMPERATURE = 0.1;
const COLORLESS_FIT = 0.55;
const DECK_SIZE_TARGET = 23;

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

type Theme = 'artifact' | 'graveyard' | 'spells' | 'tokens' | 'counters';
const THEME_PATTERNS: Record<Theme, RegExp> = {
    artifact: /\b(?:artifact|improvise|metalcraft|affinity)\b/i,
    graveyard: /\b(?:graveyard|reanimate|return .*from your graveyard|dies)\b/i,
    spells: /\b(?:instant|sorcery|noncreature spell|cast .*spell|prowess)\b/i,
    tokens: /\b(?:token|populate)\b/i,
    counters: /\b(?:\+1\/\+1 counter|counters on|proliferate)\b/i,
};

function themes(card: Card): Theme[] {
    const text = `${card.oracleText ?? ''} ${card.backOracleText ?? ''}`;
    return (Object.keys(THEME_PATTERNS) as Theme[]).filter((theme) =>
        THEME_PATTERNS[theme].test(text) || (theme === 'artifact' && isArtifact(card)));
}

function isCreature(card: Card) {
    return /\bCreature\b/i.test(card.typeLine ?? '');
}

function isInteraction(card: Card) {
    const text = `${card.oracleText ?? ''} ${card.backOracleText ?? ''}`;
    return /\b(?:destroy|exile|counter target|deals? \d+ damage to|return .* to its owner's hand|each opponent sacrifices)\b/i.test(text);
}

function isRamp(card: Card) {
    return manaColors(card).length > 0 && /\b(?:add|search your library for .*land)\b/i.test(card.oracleText ?? '');
}

export function botPick(pack: Card[], pool: Card[], strategy: BotStrategy): Card {
    const blackLotus = pack.find((card) => normalizeName(card.name) === 'black lotus');
    if (blackLotus) return blackLotus;
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

    // Track the pool's rough deck shape and a few common cube themes. These
    // deliberately remain broad heuristics: card text is not a rules engine.
    const countsAtCmc = new Map<number, number>();
    for (const card of pool) {
        if (card.land) continue;
        const cmc = Math.min(5, Math.max(1, Math.ceil(card.cmc)));
        countsAtCmc.set(cmc, (countsAtCmc.get(cmc) ?? 0) + 1);
    }
    const creatureCount = pool.filter(isCreature).length;
    const interactionCount = pool.filter(isInteraction).length;
    const rampCount = pool.filter(isRamp).length;
    const themeCounts = new Map<Theme, number>();
    for (const card of pool) for (const theme of themes(card)) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);

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
        // Strongly distinguish the top ten, then taper the premium by tier so
        // the list guides early picks without overriding established deck fit.
        const premiumBonus = rank
            ? (rank <= 10
                ? 0.62 + (10 - rank) * 0.065
                : rank <= 20
                    ? 0.20 + (20 - rank) * 0.018
                    : 0.08 + (50 - rank) * 0.003)
                * (rank <= 10 ? 1 : 1 - commitment * 0.45)
            : 0;
        const matchedLandColors = mana.filter((color) => main.has(color)).length;
        const landFixingBonus = card.land && mana.length > 1
            ? main.size === 0 ? 0.05 : matchedLandColors > 0 ? 0.08 + (matchedLandColors > 1 ? 0.04 : 0) : 0
            : card.land && matchedLandColors > 0 ? 0.06 : 0;
        // Colorless artifacts are useful, but shouldn't remain an effortless
        // default once the pool is already artifact-heavy. Artifact payoffs
        // soften the penalty to permit coherent artifact decks.
        const densityPenalty = Math.min(0.18, Math.max(0, artifactShare - 0.35) * 0.36) * Math.min(1, pool.length / 8);
        const synergyRelief = Math.max(0.35, 1 - artifactPayoffs * 0.12);
        const candidateRelief = hasArtifactPayoff(card) ? 0.5 : 1;
        const artifactBalance = isArtifact(card) ? 1 - densityPenalty * synergyRelief * candidateRelief : 1;
        const candidateThemes = themes(card);
        const synergyBonus = candidateThemes.reduce((sum, theme) => {
            const existing = themeCounts.get(theme) ?? 0;
            return sum + Math.min(0.12, existing * 0.025);
        }, 0);

        // Reward a candidate that helps fill the rough curve or a key deck role.
        const cmc = Math.min(5, Math.max(1, Math.ceil(card.cmc)));
        const atCmc = countsAtCmc.get(cmc) ?? 0;
        const curveTarget = cmc <= 2 ? 5 : cmc === 3 ? 4 : cmc === 4 ? 3 : 2;
        const curveNeed = Math.max(0, curveTarget - atCmc) / curveTarget;
        const curveBonus = !card.land ? curveNeed * (cmc <= 3 ? 0.09 : 0.05) : 0;
        const roleBonus = (isInteraction(card) && interactionCount < 4 ? 0.08 : 0) +
            (isCreature(card) && creatureCount < 12 ? 0.04 : 0) +
            (isRamp(card) && rampCount < 3 ? 0.05 : 0);
        const latePoolPenalty = pool.length >= DECK_SIZE_TARGET
            ? Math.min(0.12, (pool.length - DECK_SIZE_TARGET + 1) * 0.015)
            : 0;
        const rawScore = base + premiumBonus + landFixingBonus + synergyBonus + curveBonus + roleBonus - latePoolPenalty;
        return isArtifact(card) ? rawScore - densityPenalty * synergyRelief * candidateRelief : rawScore;
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
