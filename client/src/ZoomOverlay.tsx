import type { Card } from '../../shared/protocol';

export function ZoomOverlay({ card, onClose }: { card: Card; onClose: () => void }) {
    return (
        <div className="zoom-overlay" onClick={onClose}>
            <div className={`zoom-content${card.backImage ? ' has-back-face' : ''}`} onClick={(event) => event.stopPropagation()}>
                <img src={card.image} alt={`${card.name} (front)`} />
                {card.backImage && <img src={card.backImage} alt={`${card.name} (back)`} />}
                <button className="zoom-close" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
