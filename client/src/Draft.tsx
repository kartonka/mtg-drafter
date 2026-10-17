import { useEffect, useState } from 'react';
import type { Card, ClientMsg, TableView } from '../../shared/protocol';

interface Props {
    state: TableView;
    send: (msg: ClientMsg) => void;
}

export function Draft({ state, send }: Props) {
    const { draft } = state;
    const [selected, setSelected] = useState<string | null>(null);
    const [additionalSelected, setAdditionalSelected] = useState<string | null>(null);
    const [useLibrarian, setUseLibrarian] = useState(false);
    const [preview, setPreview] = useState<Card | null>(null);
    const pack = draft?.pack ?? null;
    const selectedId = pack?.some((c) => c.id === selected) ? selected : null;
    const additionalSelectedId = pack?.some((c) => c.id === additionalSelected && c.id !== selectedId) ? additionalSelected : null;
    const hasLibrarian = state.picks.some((card) => card.name.toLocaleLowerCase() === 'cogwork librarian');

    const confirm = (id: string | null = selectedId) => {
        if (!id) return;
        if (useLibrarian && !additionalSelectedId) return;
        send({ t: 'pick', cardId: id, ...(useLibrarian ? { additionalCardId: additionalSelectedId! } : {}) });
        setSelected(null);
        setAdditionalSelected(null);
        setUseLibrarian(false);
    };

    const selectCard = (id: string) => {
        if (!useLibrarian) {
            setSelected(id);
        } else if (id === selected) {
            setSelected(null);
            setAdditionalSelected(null);
        } else if (id === additionalSelected) {
            setAdditionalSelected(null);
        } else if (!selected) {
            setSelected(id);
        } else {
            setAdditionalSelected(id);
        }
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && selectedId && (!useLibrarian || additionalSelectedId)) {
                send({ t: 'pick', cardId: selectedId, ...(useLibrarian ? { additionalCardId: additionalSelectedId! } : {}) });
                setSelected(null);
                setAdditionalSelected(null);
                setUseLibrarian(false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId, additionalSelectedId, useLibrarian, send]);

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
                        <>
                            {hasLibrarian && pack.length > 1 && (
                                <button className={useLibrarian ? 'selected-mode' : ''} onClick={() => {
                                    setUseLibrarian((active) => !active);
                                    setSelected(null);
                                    setAdditionalSelected(null);
                                }}>
                                    {useLibrarian ? 'Cancel extra pick' : 'Use Cogwork Librarian'}
                                </button>
                            )}
                            <button className="primary" disabled={!selectedId || (useLibrarian && !additionalSelectedId)} onClick={() => confirm()}>
                                {useLibrarian ? 'Pick 2 · return Librarian' : 'Pick card'}
                            </button>
                        </>
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
                                className={c.id === selectedId || c.id === additionalSelectedId ? 'card selected' : 'card'}
                                onClick={() => selectCard(c.id)}
                                onDoubleClick={() => { if (!useLibrarian) confirm(c.id); }}
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

            <aside className="pool">
                <h2>Your picks ({state.picks.length})</h2>
                {hasLibrarian && <span className="muted">Cogwork Librarian available: draft an extra card from a pack.</span>}
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
