import type { Card } from '../../shared/protocol';

export function ZoomOverlay({ card, onClose }: { card: Card; onClose: () => void }) {
    return (
        <div className="zoom-overlay" onClick={onClose}>
            <img src={card.image} alt={card.name} />
        </div>
    );
}
