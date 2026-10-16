import type { Card } from '../../shared/protocol';

// Standard Magic card size, laid out 3x3 on A4 so cards print at real size.
const CARD_W = 63;
const CARD_H = 88;
const COLS = 3;
const ROWS = 3;
const PAGE_W = 210;
const PAGE_H = 297;

export async function exportProxyPdf(cards: Card[], fileName: string) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const marginX = (PAGE_W - COLS * CARD_W) / 2;
    const marginY = (PAGE_H - ROWS * CARD_H) / 2;

    const urls = [...new Set(cards.map((c) => c.image.replace('/normal/', '/large/')))];
    const images = new Map<string, Uint8Array>();
    await Promise.all(
        urls.map(async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Could not download an image (HTTP ${res.status}).`);
            images.set(url, new Uint8Array(await res.arrayBuffer()));
        }),
    );

    const perPage = COLS * ROWS;
    cards.forEach((card, i) => {
        if (i > 0 && i % perPage === 0) doc.addPage();
        const slot = i % perPage;
        const url = card.image.replace('/normal/', '/large/');
        // The alias makes repeated cards (basic lands) embed their image once.
        doc.addImage(images.get(url)!, 'JPEG', marginX + (slot % COLS) * CARD_W, marginY + Math.floor(slot / COLS) * CARD_H, CARD_W, CARD_H, url);
    });

    doc.save(fileName);
}
