import { useState } from 'react';
import type { DraftReviewView } from '../../shared/protocol';
import type { Card } from '../../shared/protocol';
import { DeckBuilder } from './DeckBuilder';
import { CardPreview } from './CardPreview';
import { ZoomOverlay } from './ZoomOverlay';
import { useLongPressPreview } from './useLongPressPreview';
import { useHoverCardPreview } from './useHoverCardPreview';
import { playerLabel } from './playerLabel';

export function DraftReview({ review, onClose }: { review: DraftReviewView; onClose: () => void }) {
    const [playerId, setPlayerId] = useState(review.players[0]?.id ?? '');
    const [zoom, setZoom] = useState<Card | null>(null);
    const longPress = useLongPressPreview(setZoom);
    const hoverPreview = useHoverCardPreview();
    const player = review.players.find((candidate) => candidate.id === playerId) ?? review.players[0];

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
                        {review.players.map((candidate) => <option key={candidate.id} value={candidate.id}>{playerLabel(candidate.name, candidate.isBot)}</option>)}
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
                                <span className="picked-name">{[entry.picked, ...(entry.alsoPicked ?? []), ...(entry.additionalPicked ? [entry.additionalPicked] : [])].map((card) => card.name).join(' + ')}</span>
                            </div>
                            <div className="pick-row-cards">
                                {entry.pack.map((card) => (
                                    <div className={`searchable-card ${card.id === entry.picked.id || entry.alsoPicked?.some((picked) => picked.id === card.id) || card.id === entry.additionalPicked?.id ? 'history-card picked' : 'history-card'}`} key={card.id}>
                                    <img
                                        src={card.image}
                                        alt={card.name}
                                        title={card.name}
                                        onMouseEnter={(event) => hoverPreview.show(card, event.clientX, event.clientY)}
                                        onMouseLeave={hoverPreview.hide}
                                        {...longPress.bind(card)}
                                        onClick={() => longPress.consumeClick()}
                                    />
                                        <span className="card-search-text" aria-hidden="true">{card.name}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                    {player.log.length === 0 && <p className="muted">No pick log is available for this player.</p>}
                </div>

                <h3 className="pool-title">Built deck</h3>
                <DeckBuilder
                    key={`${review.id}-${player.id}`}
                    picks={player.picks}
                    basics={review.basics ?? []}
                    storageKey={`draft-review-${review.id}-${player.id}`}
                    initialLayout={player.builtDeck ?? { columns: [], pool: [] }}
                    persistLocal={false}
                    done
                />
            </>}
            {hoverPreview.preview && <CardPreview className="deck-preview" card={hoverPreview.preview} style={{ left: hoverPreview.position.left, top: hoverPreview.position.top, right: 'auto' }} onMouseEnter={hoverPreview.keep} onMouseLeave={hoverPreview.hide} />}
            {zoom && <ZoomOverlay card={zoom} onClose={() => setZoom(null)} />}
        </section>
    );
}
