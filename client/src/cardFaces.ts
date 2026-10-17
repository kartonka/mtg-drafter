import type { Card } from '../../shared/protocol';

export function backFaceImage(card: Card): string | undefined {
    if (card.backImage) return card.backImage;
    if (!card.name.includes(' // ')) return undefined;
    const derived = card.image.replace('/front/', '/back/');
    return derived === card.image ? undefined : derived;
}
