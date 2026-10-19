import { useState } from 'react';
import { LIMITS, type BotStrategy, type ClientMsg, type TableView } from '../../shared/protocol';
import { copyText } from './clipboard';
import { playerLabel } from './playerLabel';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

interface Props {
    state: TableView;
    send: (msg: ClientMsg) => void;
}

export function Lobby({ state, send }: Props) {
    const isHost = state.you === state.hostId;
    const me = state.players.find((p) => p.id === state.you);
    const { packsPerPlayer, cardsPerPack, pickCount, botStrategy, timerStrategy } = state.settings;
    const needed = state.players.length * packsPerPlayer * cardsPerPack;
    const tooFew = needed > state.cube.size;
    const allReady = state.players.every((p) => p.ready);
    const [copied, setCopied] = useState(false);
    const [draggingPlayer, setDraggingPlayer] = useState<string | null>(null);

    const movePlayer = (targetId: string) => {
        if (!draggingPlayer || draggingPlayer === targetId) return;
        const playerIds = state.players.map((player) => player.id);
        const from = playerIds.indexOf(draggingPlayer);
        const to = playerIds.indexOf(targetId);
        if (from < 0 || to < 0) return;
        playerIds.splice(to, 0, ...playerIds.splice(from, 1));
        send({ t: 'reorder', playerIds });
        setDraggingPlayer(null);
    };

    const shiftPlayer = (playerId: string, offset: -1 | 1) => {
        const playerIds = state.players.map((player) => player.id);
        const from = playerIds.indexOf(playerId);
        const to = from + offset;
        if (from < 0 || to < 0 || to >= playerIds.length) return;
        playerIds.splice(to, 0, ...playerIds.splice(from, 1));
        send({ t: 'reorder', playerIds });
    };

    const copyLink = async () => {
        await copyText(`${location.origin}/#${state.id}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="columns">
            <section className="panel">
                <h2>Table {state.id}</h2>
                <div className="row">
                    <button onClick={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
                    {isHost && (
                        <button onClick={() => send({ t: 'addBot' })} disabled={state.players.length >= LIMITS.maxPlayers}>
                            Add bot
                        </button>
                    )}
                </div>
                <p className="muted">
                    {state.cube.name} · {state.cube.size} cards
                </p>
                {state.cube.warnings.map((w) => (
                    <p key={w} className="warn">
                        {w}
                    </p>
                ))}

                {isHost && <span className="muted seat-order-hint">Drag players to set the draft seat order.</span>}
                <ul className="players">
                    {state.players.map((p) => (
                        <li
                            key={p.id}
                            className={isHost ? 'reorderable' : ''}
                            draggable={isHost}
                            onDragStart={(event) => {
                                if (!isHost) return;
                                setDraggingPlayer(p.id);
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', p.id);
                            }}
                            onDragOver={(event) => { if (isHost && draggingPlayer) event.preventDefault(); }}
                            onDrop={(event) => { event.preventDefault(); movePlayer(p.id); }}
                            onDragEnd={() => setDraggingPlayer(null)}
                        >
                            {isHost && <span className="drag-handle" aria-hidden="true" title="Drag to change seat order">⠿</span>}
                            {isHost && <span className="seat-order-controls">
                                <button aria-label={`Move ${p.name} up`} disabled={state.players[0]?.id === p.id} onClick={() => shiftPlayer(p.id, -1)}>↑</button>
                                <button aria-label={`Move ${p.name} down`} disabled={state.players[state.players.length - 1]?.id === p.id} onClick={() => shiftPlayer(p.id, 1)}>↓</button>
                            </span>}
                            <span className={p.ready ? 'badge ready' : 'badge'}>{p.ready ? 'Ready' : 'Not ready'}</span>
                            <span className="name">
                                {playerLabel(p.name, p.isBot)}
                                {p.id === state.hostId && ' (host)'}
                                {!p.connected && ' · disconnected'}
                            </span>
                            {isHost && p.id !== state.you && (
                                <button className="link" onClick={() => send({ t: 'kick', playerId: p.id })}>
                                    Remove
                                </button>
                            )}
                        </li>
                    ))}
                </ul>

                <div className="row">
                    <button onClick={() => send({ t: 'ready', ready: !me?.ready })}>{me?.ready ? 'Not ready' : 'Ready'}</button>
                </div>
            </section>

            <section className="panel">
                <h2>Settings</h2>
                <label className="field">
                    Packs per player
                    <select
                        disabled={!isHost}
                        value={packsPerPlayer}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer: Number(e.target.value), cardsPerPack, pickCount, botStrategy, timerStrategy })}
                    >
                        {range(1, LIMITS.maxPacks).map((n) => (
                            <option key={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <label className="field">
                    Cards per pack
                    <select
                        disabled={!isHost}
                        value={cardsPerPack}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer, cardsPerPack: Number(e.target.value), pickCount, botStrategy, timerStrategy })}
                    >
                        {range(LIMITS.minCardsPerPack, LIMITS.maxCardsPerPack).map((n) => (
                            <option key={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <label className="field">
                    Picks per turn
                    <select
                        disabled={!isHost}
                        value={pickCount}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer, cardsPerPack, pickCount: Number(e.target.value), botStrategy, timerStrategy })}
                    >
                        <option value={1}>1 card (normal draft)</option>
                        <option value={2}>2 cards (pick two)</option>
                    </select>
                </label>
                <label className="field">
                    Bot strategy
                    <select
                        disabled={!isHost}
                        value={botStrategy}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer, cardsPerPack, pickCount, botStrategy: e.target.value as BotStrategy, timerStrategy })}
                    >
                        <option value="smart">Smart (colors and card strength)</option>
                        <option value="random">Random</option>
                    </select>
                </label>
                <label className="field">
                    Pick timer
                    <select
                        disabled={!isHost}
                        value={timerStrategy}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer, cardsPerPack, pickCount, botStrategy, timerStrategy: e.target.value as typeof timerStrategy })}
                    >
                        <option value="arena">Arena</option>
                        <option value="extended">Extended (2× Arena)</option>
                        <option value="off">Off</option>
                    </select>
                </label>
                <p className={tooFew ? 'warn' : 'muted'}>
                    {needed} of {state.cube.size} cards will be used.
                </p>
                {isHost ? (
                    <button
                        className="primary"
                        disabled={state.players.length < 2 || !allReady || tooFew}
                        onClick={() => send({ t: 'start' })}
                    >
                        Start draft
                    </button>
                ) : (
                    <p className="muted">Waiting for the host to start.</p>
                )}
                {isHost && state.players.length < 2 && <p className="muted">Add a player or a bot to start.</p>}
            </section>
        </div>
    );
}
