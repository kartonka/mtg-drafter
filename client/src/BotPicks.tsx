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

    const cards = [...bot.picks].sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
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
            <div className="bot-grid">
                {cards.map((c) => (
                    <div className="searchable-card bot-card-wrap" key={c.id}>
                        <img
                            src={c.image}
                            alt={c.name}
                            className="bot-card"
                            onMouseEnter={(event) => hoverPreview.show(c, event.clientX, event.clientY)}
                            onMouseLeave={hoverPreview.hide}
                            {...longPress.bind(c)}
                            onClick={() => longPress.consumeClick()}
                        />
                        <span className="card-search-text" aria-hidden="true">{c.name}</span>
                    </div>
                ))}
            </div>
            {hoverPreview.preview && <CardPreview className="deck-preview" card={hoverPreview.preview} style={{ left: hoverPreview.position.left, top: hoverPreview.position.top, right: 'auto' }} onMouseEnter={hoverPreview.keep} onMouseLeave={hoverPreview.hide} />}
            {zoom && <ZoomOverlay card={zoom} onClose={() => setZoom(null)} />}
        </section>
    );
}
