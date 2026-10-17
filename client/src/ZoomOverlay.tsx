import type { Card } from '../../shared/protocol';
import { backFaceImage } from './cardFaces';
import { mechanicHelp } from './keywordHelp';

export function ZoomOverlay({ card, onClose }: { card: Card; onClose: () => void }) {
    const backImage = backFaceImage(card);
    const help = mechanicHelp(card);
    return (
        <div className="zoom-overlay" onClick={onClose}>
            <div className={`zoom-content${backImage ? ' has-back-face' : ''}`} onClick={(event) => event.stopPropagation()}>
                {help.length > 0 && (
                    <aside className="mechanic-help zoom-mechanic-help" aria-label={`Mechanic explanations for ${card.name}`}>
                        {help.map((item) => (
                            <section key={item.name}>
                                <strong>{item.name}</strong>
                                <p>{item.description}</p>
                            </section>
                        ))}
                    </aside>
                )}
                <div className="zoom-faces">
                    <img src={card.image} alt={`${card.name} (front)`} />
                    {backImage && <img src={backImage} alt={`${card.name} (back)`} />}
                </div>
                <button className="zoom-close" onClick={onClose}>Close</button>
            </div>
        </div>
    );
}
