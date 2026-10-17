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
