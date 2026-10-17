import type { Card } from '../../shared/protocol';
import { backFaceImage } from './cardFaces';

export function CardPreview({ card, className, onMouseEnter, onMouseLeave }: {
    card: Card;
    className: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}) {
    const backImage = backFaceImage(card);
    return (
        <div className={`${className}${backImage ? ' has-back-face' : ''}`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <img src={card.image} alt={`${card.name} (front)`} />
            {backImage && <img src={backImage} alt={`${card.name} (back)`} />}
        </div>
    );
}
