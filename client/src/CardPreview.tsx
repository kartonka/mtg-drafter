import type { Card } from '../../shared/protocol';

export function CardPreview({ card, className, onMouseEnter, onMouseLeave }: {
    card: Card;
    className: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}) {
    return (
        <div className={`${className}${card.backImage ? ' has-back-face' : ''}`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <img src={card.image} alt={`${card.name} (front)`} />
            {card.backImage && <img src={card.backImage} alt={`${card.name} (back)`} />}
        </div>
    );
}
