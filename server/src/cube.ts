import type { Card } from '../../shared/protocol';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Cube {
    name: string;
    cards: Card[];
    warnings: string[];
    /** Unlimited extra copies for deck building; empty if Scryfall was unreachable. */
    basics: Card[];
}

export class CubeError extends Error { }

/** A card plus the raw popularity signals used to compute `power` once the whole cube is known. */
type ScoredCard = Card & { rank?: number; usd?: number };

const SCRYFALL_HEADERS = {
    'User-Agent': 'mtg-drafter/0.1',
    Accept: 'application/json;q=0.9,*/*;q=0.8',
    'Content-Type': 'application/json',
};
const MOXFIELD_UA = process.env.MOXFIELD_USER_AGENT ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_CUBE_SIZE = 2000;
const MAX_CUBE_NAME = 80;
const CUBE_STORE = path.resolve(import.meta.dirname, '../data/cubes.json');
const BUNDLED_CUBES = [
    { name: 'imbur', path: path.resolve(import.meta.dirname, '../../default_cubes/imbur.txt') },
    { name: 'marci-cube', path: path.resolve(import.meta.dirname, '../../marci-cube.txt') },
];

interface SavedCubeList { name: string; text: string; updatedAt: string }

const cubeKey = (name: string) => name.trim().toLocaleLowerCase();

function readSavedCubeLists(): SavedCubeList[] {
    let saved: SavedCubeList[] = [];
    try {
        const data: unknown = JSON.parse(readFileSync(CUBE_STORE, 'utf8'));
        if (!Array.isArray(data) || data.some((item) =>
            typeof item?.name !== 'string' || typeof item?.text !== 'string' ||
            (item.updatedAt !== undefined && typeof item.updatedAt !== 'string')
        )) {
            throw new Error('Invalid saved cube data.');
        }
        const storeDate = statSync(CUBE_STORE).mtime.toISOString();
        saved = data.map((item) => ({
            name: item.name,
            text: item.text,
            updatedAt: typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt)) ? item.updatedAt : storeDate,
        }));
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            if (err instanceof CubeError) throw err;
            throw new CubeError('Saved cube storage is unreadable.');
        }
    }

    const byName = new Map(saved.map((cube) => [cubeKey(cube.name), cube]));
    for (const builtin of BUNDLED_CUBES) {
        if (!byName.has(cubeKey(builtin.name)) && existsSync(builtin.path)) {
            byName.set(cubeKey(builtin.name), {
                name: builtin.name,
                text: readFileSync(builtin.path, 'utf8'),
                updatedAt: statSync(builtin.path).mtime.toISOString(),
            });
        }
    }
    return [...byName.values()];
}

export function listSavedCubeLists(): { name: string; updatedAt: string }[] {
    return readSavedCubeLists().map(({ name, updatedAt }) => ({ name, updatedAt }));
}

export function saveCubeList(rawName: unknown, rawText: unknown): { name: string; overwritten: boolean } {
    const name = typeof rawName === 'string' ? rawName.trim().slice(0, MAX_CUBE_NAME) : '';
    const text = typeof rawText === 'string' ? rawText.trim() : '';
    if (!name) throw new CubeError('Enter a name for this cube list.');
    if (!text) throw new CubeError('Paste a card list first.');
    if (text.split(/\r?\n/).length > MAX_CUBE_SIZE) throw new CubeError(`Card list is too long (max ${MAX_CUBE_SIZE} lines).`);

    const all = readSavedCubeLists();
    const overwritten = all.some((cube) => cubeKey(cube.name) === cubeKey(name));
    const saved = all.filter((cube) => ![...BUNDLED_CUBES.map((b) => cubeKey(b.name))].includes(cubeKey(cube.name)));
    const next = saved.filter((cube) => cubeKey(cube.name) !== cubeKey(name));
    next.push({ name, text, updatedAt: new Date().toISOString() });

    mkdirSync(path.dirname(CUBE_STORE), { recursive: true });
    const temp = `${CUBE_STORE}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, CUBE_STORE);
    return { name, overwritten };
}

export async function loadSavedCube(name: string): Promise<Cube> {
    const saved = readSavedCubeLists().find((cube) => cubeKey(cube.name) === cubeKey(name));
    if (!saved) throw new CubeError('No saved cube list with that name.');
    const cube = await loadFromText(saved.text, saved.name);
    cube.basics = await basicLands();
    return cube;
}

/** Pulls deck-building metadata out of a Scryfall card object; null if any is missing. */
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
    basicsCache ??= scryfallLookup(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'].map((name) => ({ name })))
        .then(({ found }) => found.map(({ rank, usd, ...c }) => ({ ...c, id: `basic-${c.name}` })))
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
    const refs: CardRef[] = [];
    const images = new Map<string, string>();
    for (const entry of entries) {
        const c = entry?.card ?? entry;
        const name: unknown = c?.name;
        if (typeof name !== 'string') continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ name });
        // Keep the printing the cube owner chose.
        const sid: unknown = c.scryfall_id ?? c.scryfallId;
        if (typeof sid === 'string' && /^[0-9a-f-]{36}$/i.test(sid)) {
            images.set(key, `https://cards.scryfall.io/normal/front/${sid[0]}/${sid[1]}/${sid}.jpg`);
        }
    }

    const { found, notFound } = await scryfallLookup(refs, images);
    const warnings = notFound.length ? [`Not found on Scryfall: ${notFound.join(', ')}`] : [];
    return finish(typeof json.name === 'string' ? json.name : 'Moxfield cube', found, warnings);
}

/** A card to look up: by exact printing when set and number are known, otherwise by name. */
interface CardRef {
    name: string;
    set?: string;
    number?: string;
}

// "1 Name (SET) 123", optionally followed by a foil marker such as *F*
const PRINTING_LINE = /^(?:\d+x?\s+)?(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+)(?:\s+\*\w+\*)?$/;

/** Moxfield writes double-faced cards as "Front / Back"; Scryfall uses "Front // Back". */
const scryfallName = (name: string) => name.replace(/ \/ /g, ' // ');

async function loadFromText(text: string, cubeName = 'Pasted cube'): Promise<Cube> {
    const lines = text.split(/\r?\n/);
    if (lines.length > MAX_CUBE_SIZE) throw new CubeError(`Card list is too long (max ${MAX_CUBE_SIZE} lines).`);

    const seen = new Set<string>();
    const refs: CardRef[] = [];
    for (const raw of lines) {
        const line = raw.trim();
        if (/^(sideboard|maybeboard|considering)\b:?$/i.test(line)) break;
        if (!line || line.startsWith('//') || /^SB:/i.test(line) || /^(deck|commander|companion)\b:?$/i.test(line)) continue;

        const printing = PRINTING_LINE.exec(line);
        const ref: CardRef = printing
            ? { name: scryfallName(printing[1]), set: printing[2].toLowerCase(), number: printing[3] }
            : { name: scryfallName(line.replace(/^\d+x?\s+/i, '').trim()) };
        const key = ref.name.toLowerCase();
        if (!ref.name || seen.has(key)) continue;
        seen.add(key);
        refs.push(ref);
    }

    const { found, notFound, fallback } = await scryfallLookup(refs);
    const warnings: string[] = [];
    if (notFound.length) warnings.push(`Not found on Scryfall: ${notFound.join(', ')}`);
    if (fallback.length) warnings.push(`Edition not found, used the default printing: ${fallback.join(', ')}`);
    return finish(cubeName, found, warnings);
}

function finish(name: string, cards: ScoredCard[], warnings: string[]): Cube {
    if (cards.length === 0) throw new CubeError('No cards found in that list.');
    if (cards.length > MAX_CUBE_SIZE) throw new CubeError(`Cube is too large (max ${MAX_CUBE_SIZE} cards).`);

    // Cube staples are popular (low EDHREC rank) and tend to be pricier.
    const popularity = percentiles(cards.map((c) => (c.rank === undefined ? undefined : -c.rank)));
    const price = percentiles(cards.map((c) => c.usd));
    cards.forEach((c, i) => {
        const signals = [popularity[i], price[i]].filter((s): s is number => s !== undefined);
        c.power = signals.length ? signals.reduce((a, b) => a + b, 0) / signals.length : 0.5;
        c.id = String(i);
        delete c.rank;
        delete c.usd;
    });
    return { name: name.slice(0, 80), cards, warnings, basics: [] };
}

/** Rank of each defined value among the defined ones, scaled 0..1. */
function percentiles(values: (number | undefined)[]): (number | undefined)[] {
    const order = values.flatMap((v, i) => (v === undefined ? [] : [i])).sort((a, b) => values[a]! - values[b]!);
    const out: (number | undefined)[] = values.map(() => undefined);
    order.forEach((index, pos) => (out[index] = order.length > 1 ? pos / (order.length - 1) : 0.5));
    return out;
}

async function scryfallLookup(
    refs: CardRef[],
    images?: Map<string, string>,
): Promise<{ found: ScoredCard[]; notFound: string[]; fallback: string[] }> {
    const found: ScoredCard[] = [];
    const notFound: string[] = [];
    const fallback: string[] = [];
    const retryByName: CardRef[] = [];
    const printingKey = (set: string, number: string) => `${set}/${number}`.toLowerCase();

    for (let i = 0; i < refs.length; i += 75) {
        const batch = refs.slice(i, i + 75);
        let data: any;
        try {
            const res = await fetch('https://api.scryfall.com/cards/collection', {
                method: 'POST',
                headers: SCRYFALL_HEADERS,
                body: JSON.stringify({
                    identifiers: batch.map((r) => (r.set && r.number ? { set: r.set, collector_number: r.number } : { name: r.name })),
                }),
                signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) throw new Error(String(res.status));
            data = await res.json();
        } catch {
            throw new CubeError('Could not reach Scryfall to look up the cards. Try again in a moment.');
        }

        const byName = new Map<string, ScoredCard>();
        const byPrinting = new Map<string, ScoredCard>();
        for (const c of data.data ?? []) {
            const image: string | undefined = c.image_uris?.normal ?? c.card_faces?.[0]?.image_uris?.normal;
            const meta = cardMeta(c);
            if (!image || !meta) continue;
            const usd = Number(c.prices?.usd);
            const card: ScoredCard = {
                id: '',
                name: c.name,
                image,
                ...meta,
                power: 0.5,
                rank: typeof c.edhrec_rank === 'number' ? c.edhrec_rank : undefined,
                usd: usd > 0 ? usd : undefined,
            };
            byName.set(String(c.name).toLowerCase(), card);
            for (const face of c.card_faces ?? []) byName.set(String(face.name).toLowerCase(), card);
            byPrinting.set(printingKey(String(c.set), String(c.collector_number)), card);
        }
        for (const ref of batch) {
            const exact = ref.set && ref.number;
            const card = exact ? byPrinting.get(printingKey(ref.set!, ref.number!)) : byName.get(ref.name.toLowerCase());
            if (card) found.push({ ...card, image: images?.get(ref.name.toLowerCase()) ?? card.image });
            else if (exact) retryByName.push({ name: ref.name });
            else notFound.push(ref.name);
        }
        if (i + 75 < refs.length) await new Promise((r) => setTimeout(r, 120));
    }

    // Printings Scryfall does not know about fall back to the default printing.
    if (retryByName.length) {
        const retry = await scryfallLookup(retryByName, images);
        found.push(...retry.found);
        notFound.push(...retry.notFound);
        fallback.push(...retryByName.map((r) => r.name).filter((n) => !retry.notFound.includes(n)));
    }
    return { found, notFound, fallback };
}
