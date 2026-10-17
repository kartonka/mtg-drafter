import type { Card } from '../../shared/protocol';
import { backFaceImage } from './cardFaces';

export function ZoomOverlay({ card, onClose }: { card: Card; onClose: () => void }) {
    const backImage = backFaceImage(card);
    return (
        <div className="zoom-overlay" onClick={onClose}>
            <div className={`zoom-content${backImage ? ' has-back-face' : ''}`} onClick={(event) => event.stopPropagation()}>
                <img src={card.image} alt={`${card.name} (front)`} />
                {backImage && <img src={backImage} alt={`${card.name} (back)`} />}
                <button className="zoom-close" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
