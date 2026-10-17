import type { Card } from '../../shared/protocol';
import { backFaceImage } from './cardFaces';
import { mechanicHelp } from './keywordHelp';

export function CardPreview({ card, className, onMouseEnter, onMouseLeave }: {
    card: Card;
    className: string;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
}) {
    const backImage = backFaceImage(card);
    const help = mechanicHelp(card);
    return (
        <div className={`${className}${backImage ? ' has-back-face' : ''}`} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
            <div className="preview-faces">
                <img src={card.image} alt={`${card.name} (front)`} />
                {backImage && <img src={backImage} alt={`${card.name} (back)`} />}
            </div>
            {help.length > 0 && (
                <aside className="mechanic-help" aria-label={`Mechanic explanations for ${card.name}`}>
                    {help.map((item) => (
                        <section key={item.name}>
                            <strong>{item.name}</strong>
                            <p>{item.description}</p>
                        </section>
                    ))}
                </aside>
            )}
        </div>
    );
}
