import { useEffect, useState } from 'react';
import type { Card } from '../../shared/protocol';

export function ZoomOverlay({ card, onClose }: { card: Card; onClose: () => void }) {
    const [flipped, setFlipped] = useState(false);
    useEffect(() => setFlipped(false), [card.id]);

    return (
        <div className="zoom-overlay" onClick={onClose}>
            <div className="zoom-content" onClick={(event) => event.stopPropagation()}>
                <img
                    src={flipped && card.backImage ? card.backImage : card.image}
                    alt={card.name}
                    onClick={() => card.backImage && setFlipped((value) => !value)}
                />
                {card.backImage && (
                    <button className="zoom-flip" onClick={() => setFlipped((value) => !value)}>
                        {flipped ? 'Show front' : 'Show back'}
                    </button>
                )}
                <button className="zoom-close" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
