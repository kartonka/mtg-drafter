import type { Card } from '../../shared/protocol';

export interface Cube {
    name: string;
    cards: Card[];
    warnings: string[];
    /** Unlimited extra copies for deck building; empty if Scryfall was unreachable. */
    basics: Card[];
}

export class CubeError extends Error { }

const SCRYFALL_HEADERS = {
    'User-Agent': 'mtg-drafter/0.1',
    Accept: 'application/json;q=0.9,*/*;q=0.8',
    'Content-Type': 'application/json',
};
const MOXFIELD_UA = process.env.MOXFIELD_USER_AGENT ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_CUBE_SIZE = 2000;

/** Pulls deck-building metadata out of a Moxfield or Scryfall card object; null if any is missing. */
function cardMeta(c: any): Pick<Card, 'cmc' | 'colors' | 'land'> | null {
    const typeLine = c?.type_line ?? c?.card_faces?.[0]?.type_line;
    const colors = c?.colors ?? c?.card_faces?.[0]?.colors;
    if (typeof c?.cmc !== 'number' || typeof typeLine !== 'string' || !Array.isArray(colors)) return null;
    return { cmc: c.cmc, colors: colors.filter((x: unknown) => typeof x === 'string'), land: /\bLand\b/.test(typeLine.split(' // ')[0]) };
}
const MOXFIELD_URL = /^https?:\/\/(?:www\.)?moxfield\.com\/(cubes|decks)\/([A-Za-z0-9_-]+)/i;

export async function loadCube(source: { url?: string; text?: string }): Promise<Cube> {
    const url = source.url?.trim();
    const text = source.text?.trim();
    let cube: Cube;
    if (text) cube = await loadFromText(text);
    else if (url) cube = await loadFromMoxfield(url);
    else throw new CubeError('Provide a Moxfield link or a card list.');
    cube.basics = await basicLands();
    return cube;
}

let basicsCache: Promise<Card[]> | null = null;

function basicLands(): Promise<Card[]> {
    basicsCache ??= scryfallLookup(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'])
        .then(({ found }) => found.map((c) => ({ ...c, id: `basic-${c.name}` })))
        .catch(() => {
            basicsCache = null;
            return [];
        });
    return basicsCache;
}

async function loadFromMoxfield(url: string): Promise<Cube> {
    const match = MOXFIELD_URL.exec(url);
    if (!match) throw new CubeError('That does not look like a Moxfield cube or deck link.');
    const [, kind, id] = match;

    const endpoints =
        kind.toLowerCase() === 'cubes'
            ? [`https://api2.moxfield.com/v3/cubes/${id}`, `https://api2.moxfield.com/v2/decks/all/${id}`]
            : [`https://api2.moxfield.com/v2/decks/all/${id}`, `https://api2.moxfield.com/v3/decks/all/${id}`];

    let json: any = null;
    let status = 0;
    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                headers: { 'User-Agent': MOXFIELD_UA, Accept: 'application/json' },
                signal: AbortSignal.timeout(15000),
            });
            status = res.status;
            if (res.ok) {
                json = await res.json();
                break;
            }
        } catch {
            status = 0;
        }
    }
    if (!json) {
        throw new CubeError(
            `Moxfield did not return the list (HTTP ${status || 'network error'}). Moxfield may be blocking this server; ` +
            'export the list from Moxfield as text and paste it instead.',
        );
    }

    const board = json.boards?.mainboard?.cards ?? json.mainboard;
    const entries: any[] = Array.isArray(board) ? board : board ? Object.values(board) : [];

    const seen = new Set<string>();
    const cards: Card[] = [];
    const needLookup: string[] = [];
    for (const entry of entries) {
        const c = entry?.card ?? entry;
        const name: unknown = c?.name;
        if (typeof name !== 'string') continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const sid: unknown = c.scryfall_id ?? c.scryfallId;
        const meta = cardMeta(c);
        if (meta && typeof sid === 'string' && /^[0-9a-f-]{36}$/i.test(sid)) {
            cards.push({ id: '', name, image: `https://cards.scryfall.io/normal/front/${sid[0]}/${sid[1]}/${sid}.jpg`, ...meta });
        } else {
            needLookup.push(name);
        }
    }

    const warnings: string[] = [];
    if (needLookup.length) {
        const { found, notFound } = await scryfallLookup(needLookup);
        cards.push(...found);
        if (notFound.length) warnings.push(`Not found on Scryfall: ${notFound.join(', ')}`);
    }

    return finish(typeof json.name === 'string' ? json.name : 'Moxfield cube', cards, warnings);
}

async function loadFromText(text: string): Promise<Cube> {
    const lines = text.split(/\r?\n/);
    if (lines.length > MAX_CUBE_SIZE) throw new CubeError(`Card list is too long (max ${MAX_CUBE_SIZE} lines).`);

    const seen = new Set<string>();
    const names: string[] = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('//') || /^(sideboard|maybeboard|deck|commander)\b:?$/i.test(line)) continue;
        // "1 Name", "1x Name (SET) 123"
        const name = line.replace(/^\d+x?\s+/i, '').replace(/\s+\([A-Za-z0-9]+\)(\s+\S+)*$/, '').trim();
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        names.push(name);
    }

    const { found, notFound } = await scryfallLookup(names);
    const warnings = notFound.length ? [`Not found on Scryfall: ${notFound.join(', ')}`] : [];
    return finish('Pasted cube', found, warnings);
}

function finish(name: string, cards: Card[], warnings: string[]): Cube {
    if (cards.length === 0) throw new CubeError('No cards found in that list.');
    if (cards.length > MAX_CUBE_SIZE) throw new CubeError(`Cube is too large (max ${MAX_CUBE_SIZE} cards).`);
    cards.forEach((c, i) => (c.id = String(i)));
    return { name: name.slice(0, 80), cards, warnings, basics: [] };
}

async function scryfallLookup(names: string[]): Promise<{ found: Card[]; notFound: string[] }> {
    const found: Card[] = [];
    const notFound: string[] = [];

    for (let i = 0; i < names.length; i += 75) {
        const batch = names.slice(i, i + 75);
        let data: any;
        try {
            const res = await fetch('https://api.scryfall.com/cards/collection', {
                method: 'POST',
                headers: SCRYFALL_HEADERS,
                body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
                signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) throw new Error(String(res.status));
            data = await res.json();
        } catch {
            throw new CubeError('Could not reach Scryfall to look up the cards. Try again in a moment.');
        }

        const byName = new Map<string, Card>();
        for (const c of data.data ?? []) {
            const image: string | undefined = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal;
            const meta = cardMeta(c);
            if (!image || !meta) continue;
            const card: Card = { id: '', name: c.name, image, ...meta };
            byName.set(String(c.name).toLowerCase(), card);
            for (const face of c.card_faces ?? []) byName.set(String(face.name).toLowerCase(), card);
        }
        for (const name of batch) {
            const card = byName.get(name.toLowerCase());
            if (card) found.push({ ...card });
            else notFound.push(name);
        }
        if (i + 75 < names.length) await new Promise((r) => setTimeout(r, 120));
    }
    return { found, notFound };
}
