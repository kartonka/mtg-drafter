import { useState } from 'react';
import type { Card } from '../../shared/protocol';

type GroupMode = 'cmc' | 'color';

const CMC_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+', 'Lands'];
const COLOR_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Lands'];
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

function groupLabel(c: Card, mode: GroupMode): string {
    if (c.land) return 'Lands';
    if (mode === 'cmc') return c.cmc >= 7 ? '7+' : String(Math.floor(c.cmc));
    if (c.colors.length === 0) return 'Colorless';
    return c.colors.length > 1 ? 'Multicolor' : (COLOR_NAMES[c.colors[0]] ?? 'Colorless');
}

function group(cards: Card[], mode: GroupMode) {
    const order = mode === 'cmc' ? CMC_ORDER : COLOR_ORDER;
    return order
        .map((label) => ({
            label,
            cards: cards.filter((c) => groupLabel(c, mode) === label).sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name)),
        }))
        .filter((g) => g.cards.length > 0);
}

function readIds(key: string): string[] {
    try {
        return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
        return [];
    }
}

interface Props {
    picks: Card[];
    /** Per player and table; keeps the deck across reloads. */
    storageKey: string;
    done: boolean;
}

export function DeckBuilder({ picks, storageKey, done }: Props) {
    const [deckIds, setDeckIds] = useState(() => new Set(readIds(storageKey)));
    const [mode, setMode] = useState<GroupMode>(() => (localStorage.getItem('mtg-drafter-group') === 'color' ? 'color' : 'cmc'));
    const [preview, setPreview] = useState<Card | null>(null);
    const [copied, setCopied] = useState('');

    const deck = picks.filter((c) => deckIds.has(c.id));
    const pool = picks.filter((c) => !deckIds.has(c.id));

    const update = (next: Set<string>) => {
        setDeckIds(next);
        localStorage.setItem(storageKey, JSON.stringify([...next]));
    };
    const toggle = (id: string) => {
        const next = new Set(deckIds);
        if (!next.delete(id)) next.add(id);
        update(next);
        setPreview(null);
    };
    const changeMode = (m: GroupMode) => {
        setMode(m);
        localStorage.setItem('mtg-drafter-group', m);
    };
    const copy = async (label: string, cards: Card[]) => {
        await navigator.clipboard.writeText(cards.map((c) => `1 ${c.name}`).join('\n'));
        setCopied(label);
        setTimeout(() => setCopied(''), 1500);
    };

    return (
        <div className="deckbuilder">
            <div className="draft-header">
                <h2>{done ? 'Draft complete' : 'Deck builder'}</h2>
                <span className="muted">
                    Click a card to move it between the deck and the pool.
                </span>
                <label className="inline">
                    Group by
                    <select value={mode} onChange={(e) => changeMode(e.target.value as GroupMode)}>
                        <option value="cmc">Mana value</option>
                        <option value="color">Color</option>
                    </select>
                </label>
            </div>

            <div className="section-header">
                <h3>
                    Deck ({deck.length}) <span className="muted">· {deck.filter((c) => c.land).length} lands</span>
                </h3>
                <button onClick={() => copy('deck', deck)} disabled={deck.length === 0}>
                    {copied === 'deck' ? 'Copied!' : 'Copy deck list'}
                </button>
                <button onClick={() => update(new Set())} disabled={deck.length === 0}>
                    Move all to pool
                </button>
            </div>
            {deck.length === 0 ? (
                <p className="waiting">Your deck is empty. Click cards in the pool to add them.</p>
            ) : (
                <Columns cards={deck} mode={mode} onClick={toggle} onHover={setPreview} />
            )}

            <div className="section-header">
                <h3>Pool ({pool.length})</h3>
                <button onClick={() => copy('all', picks)} disabled={picks.length === 0}>
                    {copied === 'all' ? 'Copied!' : 'Copy all picks'}
                </button>
                <button onClick={() => update(new Set(picks.map((c) => c.id)))} disabled={pool.length === 0}>
                    Move all to deck
                </button>
            </div>
            {pool.length > 0 && <Columns cards={pool} mode={mode} onClick={toggle} onHover={setPreview} />}

            {preview && <img className="deck-preview" src={preview.image} alt={preview.name} />}
        </div>
    );
}

interface ColumnsProps {
    cards: Card[];
    mode: GroupMode;
    onClick: (id: string) => void;
    onHover: (card: Card | null) => void;
}

function Columns({ cards, mode, onClick, onHover }: ColumnsProps) {
    return (
        <div className="columns-row">
            {group(cards, mode).map((g) => (
                <div key={g.label} className="stack">
                    <div className="stack-label">
                        {g.label} ({g.cards.length})
                    </div>
                    {g.cards.map((c) => (
                        <img
                            key={c.id}
                            src={c.image}
                            alt={c.name}
                            className="stack-card"
                            onClick={() => onClick(c.id)}
                            onMouseEnter={() => onHover(c)}
                            onMouseLeave={() => onHover(null)}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
