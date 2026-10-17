import { useEffect, useState } from 'react';
import type { Card, ClientMsg, TableView } from '../../shared/protocol';
import { ZoomOverlay } from './ZoomOverlay';

interface Props {
    state: TableView;
    send: (msg: ClientMsg) => void;
}

export function Draft({ state, send }: Props) {
    const { draft } = state;
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [useLibrarian, setUseLibrarian] = useState(false);
    const [preview, setPreview] = useState<Card | null>(null);
    const [zoom, setZoom] = useState<Card | null>(null);
    const [now, setNow] = useState(Date.now());
    const pack = draft?.pack ?? null;
    const selected = pack ? selectedIds.filter((id) => pack.some((card) => card.id === id)) : [];
    const basePickCount = Math.min(state.settings.pickCount, pack?.length ?? 0);
    const requiredPickCount = basePickCount + (useLibrarian ? 1 : 0);
    const hasLibrarian = state.picks.some((card) => card.name.toLocaleLowerCase() === 'cogwork librarian');
    const canUseLibrarian = hasLibrarian && (pack?.length ?? 0) > basePickCount;
    const lastSelected = pack?.find((c) => c.id === selected[selected.length - 1]) ?? null;
    const secondsLeft = draft?.pickDeadline ? Math.max(0, Math.ceil((draft.pickDeadline - now) / 1000)) : null;
    const packKey = pack?.map((card) => card.id).join(',') ?? '';

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
        if (!draft?.pickDeadline) return;
        setNow(Date.now());
        const interval = window.setInterval(() => setNow(Date.now()), 250);
        return () => window.clearInterval(interval);
    }, [draft?.pickDeadline, draft?.round, draft?.pickNumber]);

    useEffect(() => {
        setSelectedIds([]);
        setUseLibrarian(false);
    }, [packKey]);

    useEffect(() => {
        if (!pack) return;
        const cardIds = selected.slice(0, basePickCount);
        const additionalCardId = useLibrarian && selected.length === requiredPickCount ? selected[basePickCount] : undefined;
        send({ t: 'reservePick', cardIds, ...(additionalCardId ? { additionalCardId } : {}) });
    }, [selectedIds, useLibrarian, packKey, basePickCount, requiredPickCount, send]);

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

    // Shown in the header on desktop and in the bottom bar on phones.
    const controls = (extraClass: string) => (
        <>
            {canUseLibrarian && (
                <button
                    className={`${useLibrarian ? 'selected-mode' : ''} ${extraClass}`.trim()}
                    onClick={() => {
                        const enabled = !useLibrarian;
                        setUseLibrarian(enabled);
                        setSelectedIds((current) => (enabled ? current : current.slice(0, basePickCount)));
                    }}
                >
                    {useLibrarian ? 'Cancel extra pick' : 'Use Cogwork Librarian'}
                </button>
            )}
            <button className={`primary ${extraClass}`.trim()} disabled={selected.length !== requiredPickCount} onClick={confirm}>
                {useLibrarian ? `Pick ${requiredPickCount} · return Librarian` : `Pick ${requiredPickCount}`}
            </button>
        </>
    );

    return (
        <div className="draft">
            <section className="pack-area">
                <div className="draft-header">
                    <strong>
                        Pack {draft.round} of {draft.totalRounds}
                        {pack && ` · Pick ${draft.pickNumber} · choose ${basePickCount}${basePickCount === 1 ? ' card' : ' cards'}`}
                    </strong>
                    {pack && secondsLeft !== null && <span className={secondsLeft <= 10 ? 'pick-timer urgent' : 'pick-timer'}>Time {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</span>}
                    <span className="muted">Passing {draft.direction === 1 ? 'left' : 'right'} to {next?.name}</span>
                    {pack && controls('desktop-only')}
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

            {pack && (
                <div className="action-bar mobile-only">
                    <span className="muted">
                        {selected.length ? pack.filter((c) => selected.includes(c.id)).map((c) => c.name).join(', ') : 'Tap a card to select it'}
                    </span>
                    <button disabled={!lastSelected} onClick={() => setZoom(lastSelected)}>
                        Zoom
                    </button>
                    {controls('')}
                </div>
            )}
            {zoom && <ZoomOverlay card={zoom} onClose={() => setZoom(null)} />}

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
