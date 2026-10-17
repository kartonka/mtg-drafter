import { useEffect, useState } from 'react';
import type { Card, ClientMsg, TableView } from '../../shared/protocol';

interface Props {
    state: TableView;
    send: (msg: ClientMsg) => void;
}

export function Draft({ state, send }: Props) {
    const { draft } = state;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [useLibrarian, setUseLibrarian] = useState(false);
    const [preview, setPreview] = useState<Card | null>(null);
    const pack = draft?.pack ?? null;
    const selected = pack ? selectedIds.filter((id) => pack.some((card) => card.id === id)) : [];
    const basePickCount = Math.min(state.settings.pickCount, pack?.length ?? 0);
    const requiredPickCount = basePickCount + (useLibrarian ? 1 : 0);
    const hasLibrarian = state.picks.some((card) => card.name.toLocaleLowerCase() === 'cogwork librarian');
    const canUseLibrarian = hasLibrarian && (pack?.length ?? 0) > basePickCount;

    const confirm = () => {
        if (selected.length !== requiredPickCount) return;
        send({
            t: 'pick',
            cardIds: selected.slice(0, basePickCount),
            ...(useLibrarian ? { additionalCardId: selected[basePickCount] } : {}),
        });
        setSelectedIds([]);
        setUseLibrarian(false);
    };

    const selectCard = (id: string) => {
        if (selected.includes(id)) return setSelectedIds(selected.filter((selectedId) => selectedId !== id));
        const target = requiredPickCount;
        setSelectedIds(selected.length < target ? [...selected, id] : [...selected.slice(0, target - 1), id]);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && selected.length === requiredPickCount) confirm();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected, requiredPickCount, confirm]);

    if (!draft) return null;
    const seat = state.players.findIndex((p) => p.id === state.you);
    const next = state.players[(seat + draft.direction + state.players.length) % state.players.length];

    return (
        <div className="draft">
            <section className="pack-area">
                <div className="draft-header">
                    <strong>
                        Pack {draft.round} of {draft.totalRounds}
                        {pack && ` · Pick ${draft.pickNumber} · choose ${basePickCount}${basePickCount === 1 ? ' card' : ' cards'}`}
                    </strong>
                    <span className="muted">Passing {draft.direction === 1 ? 'left' : 'right'} to {next?.name}</span>
                    {pack && (
                        <>
                            {canUseLibrarian && (
                                <button className={useLibrarian ? 'selected-mode' : ''} onClick={() => {
                                    const next = !useLibrarian;
                                    setUseLibrarian(next);
                                    setSelectedIds((current) => next ? current : current.slice(0, basePickCount));
                                }}>
                                    {useLibrarian ? 'Cancel extra pick' : 'Use Cogwork Librarian'}
                                </button>
                            )}
                            <button className="primary" disabled={selected.length !== requiredPickCount} onClick={confirm}>
                                {useLibrarian ? `Pick ${requiredPickCount} · return Librarian` : `Pick ${requiredPickCount}`}
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
                                className={selected.includes(c.id) ? 'card selected' : 'card'}
                                onClick={() => selectCard(c.id)}
                                onDoubleClick={() => { if (state.settings.pickCount === 1 && !useLibrarian) { setSelectedIds([c.id]); send({ t: 'pick', cardIds: [c.id] }); } }}
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
