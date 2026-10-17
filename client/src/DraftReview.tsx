import { useMemo, useState } from 'react';
import type { Card, DraftReviewView } from '../../shared/protocol';

const manaValue = (card: Card) => card.land ? 'Lands' : card.cmc >= 7 ? '7+' : String(Math.max(0, Math.floor(card.cmc)));
const columns = ['0', '1', '2', '3', '4', '5', '6', '7+', 'Lands'];

export function DraftReview({ review, onClose }: { review: DraftReviewView; onClose: () => void }) {
    const [playerId, setPlayerId] = useState(review.players[0]?.id ?? '');
    const player = review.players.find((candidate) => candidate.id === playerId) ?? review.players[0];
    const poolColumns = useMemo(() => {
        if (!player) return [];
        return columns.map((value) => ({
            value,
            cards: player.picks.filter((card) => manaValue(card) === value),
        })).filter((column) => column.cards.length > 0);
    }, [player]);

    const download = () => {
        if (!player) return;
        const blob = new Blob([JSON.stringify({ table: review.id, cube: review.cubeName, player: player.name, picks: player.log }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `draft-${review.id.toLowerCase()}-${player.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-log.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return (
        <section className="draft-review-page">
            <div className="review-title">
                <div>
                    <h2>Draft review · {review.id}</h2>
                    <span className="muted">{review.cubeName} · Started {review.startedAt}</span>
                </div>
                <button onClick={onClose}>Back</button>
            </div>
            <div className="review-toolbar">
                <label className="field">
                    Player
                    <select value={player?.id ?? ''} onChange={(event) => setPlayerId(event.target.value)}>
                        {review.players.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.isBot ? ' (bot)' : ''}</option>)}
                    </select>
                </label>
                {player && <button onClick={download}>Download pick log</button>}
                <span className="muted">{player?.picks.length ?? 0} cards drafted</span>
            </div>

            {player && <>
                <h3>Pick history</h3>
                <div className="pick-history">
                    {player.log.map((entry) => (
                        <section className="pick-row" key={`${entry.round}-${entry.pick}`}>
                            <div className="pick-row-label">
                                <strong>Pick {entry.pick}</strong>
                                <span>Pack {entry.round}</span>
                                <span className="picked-name">{entry.picked.name}{entry.additionalPicked ? ` + ${entry.additionalPicked.name}` : ''}</span>
                            </div>
                            <div className="pick-row-cards">
                                {entry.pack.map((card) => (
                                    <div className={card.id === entry.picked.id || card.id === entry.additionalPicked?.id ? 'history-card picked' : 'history-card'} key={card.id}>
                                        <img src={card.image} alt={card.name} title={card.name} />
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                    {player.log.length === 0 && <p className="muted">No pick log is available for this player.</p>}
                </div>

                <h3 className="pool-title">Final pool by mana value</h3>
                <div className="review-pool-columns">
                    {poolColumns.map(({ value, cards }) => (
                        <section className="review-pool-column" key={value}>
                            <h4>{value} <span className="muted">({cards.length})</span></h4>
                            <div className="review-pool-stack">
                                {cards.map((card) => <img key={card.id} src={card.image} alt={card.name} title={card.name} />)}
                            </div>
                        </section>
                    ))}
                    {poolColumns.length === 0 && <p className="muted">No drafted cards.</p>}
                </div>
            </>}
        </section>
    );
}
