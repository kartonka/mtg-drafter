import { useState } from 'react';
import type { Card, TableView } from '../../shared/protocol';
import { copyText } from './clipboard';
import { CardPreview } from './CardPreview';
import { ZoomOverlay } from './ZoomOverlay';
import { useLongPressPreview } from './useLongPressPreview';
import { useHoverCardPreview } from './useHoverCardPreview';

export function BotPicks({ bots }: { bots: TableView['botPicks'] }) {
    const [selectedId, setSelectedId] = useState(bots[0]?.id);
    const hoverPreview = useHoverCardPreview();
    const [zoom, setZoom] = useState<Card | null>(null);
    const longPress = useLongPressPreview(setZoom);
    const [copied, setCopied] = useState(false);
    const bot = bots.find((b) => b.id === selectedId) ?? bots[0];
    if (!bot) return null;

    const cards = bot.picks;
    const copy = async () => {
        await copyText(cards.map((c) => `1 ${c.name}`).join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <section>
            <div className="section-header">
                <h3>Bot picks (host only)</h3>
                <button onClick={copy}>{copied ? 'Copied!' : 'Copy list'}</button>
            </div>
            <nav className="tabs">
                {bots.map((b) => (
                    <button key={b.id} className={b.id === bot.id ? 'active' : ''} onClick={() => setSelectedId(b.id)}>
                        {b.name} ({b.picks.length})
                    </button>
                ))}
            </nav>
            <div className="pick-history">
                {bot.log.map((entry) => {
                    const chosen = [entry.picked, ...(entry.alsoPicked ?? []), ...(entry.additionalPicked ? [entry.additionalPicked] : [])];
                    return <section className="pick-row" key={`${entry.round}-${entry.pick}`}>
                        <div className="pick-row-label">
                            <strong>Pick {entry.pick}</strong>
                            <span>Pack {entry.round}</span>
                            <span className="picked-name">{chosen.map((card) => card.name).join(' + ')}</span>
                        </div>
                        <div className="pick-row-cards">
                            {entry.pack.map((card) => <div className={`searchable-card ${chosen.some((picked) => picked.id === card.id) ? 'history-card picked' : 'history-card'}`} key={card.id}>
                                <img src={card.image} alt={card.name} title={card.name}
                                    onMouseEnter={(event) => hoverPreview.show(card, event.clientX, event.clientY)}
                                    onMouseLeave={hoverPreview.hide} {...longPress.bind(card)} onClick={() => longPress.consumeClick()} />
                                <span className="card-search-text" aria-hidden="true">{card.name}</span>
                            </div>)}
                        </div>
                    </section>;
                })}
            </div>
            {hoverPreview.preview && <CardPreview className="deck-preview" card={hoverPreview.preview} style={{ left: hoverPreview.position.left, top: hoverPreview.position.top, right: 'auto' }} onMouseEnter={hoverPreview.keep} onMouseLeave={hoverPreview.hide} />}
            {zoom && <ZoomOverlay card={zoom} onClose={() => setZoom(null)} />}
        </section>
    );
}
