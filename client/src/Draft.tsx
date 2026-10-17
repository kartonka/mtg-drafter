import { useEffect, useState } from 'react';
import type { Card, ClientMsg, TableView } from '../../shared/protocol';
import { ZoomOverlay } from './ZoomOverlay';

interface Props {
    state: TableView;
    send: (msg: ClientMsg) => void;
}

export function Draft({ state, send }: Props) {
    const { draft } = state;
    const [selected, setSelected] = useState<string | null>(null);
    const [preview, setPreview] = useState<Card | null>(null);
    const [zoom, setZoom] = useState<Card | null>(null);
    const pack = draft?.pack ?? null;
    const selectedId = pack?.some((c) => c.id === selected) ? selected : null;
    const selectedCard = pack?.find((c) => c.id === selectedId) ?? null;

    const confirm = (id: string | null = selectedId) => {
        if (!id) return;
        send({ t: 'pick', cardId: id });
        setSelected(null);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && selectedId) {
                send({ t: 'pick', cardId: selectedId });
                setSelected(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, send]);

    if (!draft) return null;
    const seat = state.players.findIndex((p) => p.id === state.you);
    const next = state.players[(seat + draft.direction + state.players.length) % state.players.length];

    return (
        <div className="draft">
            <section className="pack-area">
                <div className="draft-header">
                    <strong>
                        Pack {draft.round} of {draft.totalRounds}
                        {pack && ` · Pick ${draft.pickNumber} of ${state.settings.cardsPerPack}`}
                    </strong>
                    <span className="muted">Passing {draft.direction === 1 ? 'left' : 'right'} to {next?.name}</span>
                    {pack && (
                        <button className="primary desktop-only" disabled={!selectedId} onClick={() => confirm()}>
                            Pick card
                        </button>
                    )}
                </div>

                {pack ? (
                    <div className="grid">
                        {pack.map((c) => (
                            <img
                                key={c.id}
                                src={c.image}
                                alt={c.name}
                                title={c.name}
                                draggable={false}
                                className={c.id === selectedId ? 'card selected' : 'card'}
                                onClick={() => setSelected(c.id)}
                                onDoubleClick={() => confirm(c.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <p className="waiting">Waiting for the next pack…</p>
                )}

                <ul className="seats">
                    {state.players.map((p) => (
                        <li key={p.id} className={p.id === state.you ? 'me' : ''}>
                            {p.name}
                            {!p.connected && ' (offline)'} · {p.picks} picked · {p.waitingPacks} waiting
                            {state.you === state.hostId && !p.isBot && !p.connected && (
                                <button className="link" onClick={() => send({ t: 'kick', playerId: p.id })}>
                                    Replace with bot
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            {pack && (
                <div className="action-bar mobile-only">
                    <span className="muted">{selectedCard ? selectedCard.name : 'Tap a card to select it'}</span>
                    <button disabled={!selectedCard} onClick={() => setZoom(selectedCard)}>
                        Zoom
                    </button>
                    <button className="primary" disabled={!selectedId} onClick={() => confirm()}>
                        Pick card
                    </button>
                </div>
            )}
            {zoom && <ZoomOverlay card={zoom} onClose={() => setZoom(null)} />}

            <aside className="pool">
                <h2>Your picks ({state.picks.length})</h2>
                <ul>
                    {state.picks.map((c) => (
                        <li key={c.id} onMouseEnter={() => setPreview(c)} onMouseLeave={() => setPreview(null)}>
                            {c.name}
                        </li>
                    ))}
                </ul>
                {preview && <img className="preview" src={preview.image} alt={preview.name} />}
            </aside>
        </div>
    );
}
