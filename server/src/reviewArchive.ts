import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DraftReviewView } from '../../shared/protocol';

const ARCHIVE_DIR = path.resolve(import.meta.dirname, '../data/draft-reviews');

export interface ArchivedDraftSummary {
    tableId: string;
    cubeName: string;
    startedAt: string;
}

const fileFor = (tableId: string) => path.join(ARCHIVE_DIR, `${tableId.toUpperCase()}.json`);

export function archiveDraftReview(review: DraftReviewView) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const file = fileFor(review.id);
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(review));
    renameSync(temp, file);
}

export function getArchivedDraftReview(tableId: string): DraftReviewView | null {
    if (!/^[A-Z0-9]{5,8}$/i.test(tableId)) return null;
    const file = fileFor(tableId);
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as DraftReviewView;
    } catch {
        return null;
    }
}

export function listArchivedDraftReviews(): ArchivedDraftSummary[] {
    if (!existsSync(ARCHIVE_DIR)) return [];
    return readdirSync(ARCHIVE_DIR)
        .filter((file) => /^[A-Z0-9]{5,8}\.json$/i.test(file))
        .flatMap((file) => {
            const review = getArchivedDraftReview(file.slice(0, -5));
            return review && typeof review.startedAt === 'string'
                ? [{ tableId: review.id, cubeName: review.cubeName, startedAt: review.startedAt }]
                : [];
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export interface TopPickCard { card: DraftReviewView['players'][number]['picks'][number]; count: number }
export interface TopPicksView {
    players: string[];
    humanByPlayer: Record<string, TopPickCard[]>;
    bots: TopPickCard[];
}

export function getTopPicks(cubeName?: string): TopPicksView {
    const human = new Map<string, Map<string, TopPickCard>>();
    const bots = new Map<string, TopPickCard>();
    for (const summary of listArchivedDraftReviews().filter((item) => !cubeName || item.cubeName === cubeName)) {
        const review = getArchivedDraftReview(summary.tableId);
        if (!review) continue;
        for (const player of review.players) {
            const firstByRound = new Map<number, DraftReviewView['players'][number]['log'][number]>();
            for (const entry of player.log) {
                const previous = firstByRound.get(entry.round);
                if (!previous || entry.pick < previous.pick) firstByRound.set(entry.round, entry);
            }
            const target = player.isBot ? bots : (human.get(player.name.trim()) ?? new Map<string, TopPickCard>());
            if (!player.isBot) human.set(player.name.trim(), target);
            for (const entry of firstByRound.values()) {
                const card = entry.picked;
                const item = target.get(card.id);
                if (item) item.count++;
                else target.set(card.id, { card, count: 1 });
            }
        }
    }
    const sorted = (items: Map<string, TopPickCard>) => [...items.values()].sort((a, b) => b.count - a.count || a.card.name.localeCompare(b.card.name));
    return {
        players: [...human.keys()].sort((a, b) => a.localeCompare(b)),
        humanByPlayer: Object.fromEntries([...human].map(([name, items]) => [name, sorted(items)])),
        bots: sorted(bots),
    };
}
