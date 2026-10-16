import { useState } from 'react';
import type { Card, TableView } from '../../shared/protocol';
import { copyText } from './clipboard';

export function BotPicks({ bots }: { bots: TableView['botPicks'] }) {
    const [selectedId, setSelectedId] = useState(bots[0]?.id);
    const [preview, setPreview] = useState<Card | null>(null);
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
                    <img
                        key={c.id}
                        src={c.image}
                        alt={c.name}
                        className="bot-card"
                        onMouseEnter={() => setPreview(c)}
                        onMouseLeave={() => setPreview(null)}
                    />
                ))}
            </div>
            {preview && <img className="deck-preview" src={preview.image} alt={preview.name} />}
        </section>
    );
}
