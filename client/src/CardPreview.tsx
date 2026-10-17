import { useEffect, useState } from 'react';
import type { Card } from '../../shared/protocol';

export function CardPreview({ card, className, onMouseEnter, onMouseLeave }: {
    card: Card;
    className: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}) {
    const [flipped, setFlipped] = useState(false);
    useEffect(() => setFlipped(false), [card.id]);

    return (
        <div className={className} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <img src={flipped && card.backImage ? card.backImage : card.image} alt={card.name} />
            {card.backImage && (
                <button className="preview-flip" onClick={() => setFlipped((value) => !value)}>
                    {flipped ? 'Show front' : 'Show back'}
                </button>
            )}
        </div>
    );
}
