import { useState } from 'react';
import { LIMITS, type BotStrategy, type ClientMsg, type TableView } from '../../shared/protocol';
import { copyText } from './clipboard';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

interface Props {
    state: TableView;
    send: (msg: ClientMsg) => void;
}

export function Lobby({ state, send }: Props) {
    const isHost = state.you === state.hostId;
    const me = state.players.find((p) => p.id === state.you);
    const { packsPerPlayer, cardsPerPack, botStrategy } = state.settings;
    const needed = state.players.length * packsPerPlayer * cardsPerPack;
    const tooFew = needed > state.cube.size;
    const allReady = state.players.every((p) => p.ready);
    const [copied, setCopied] = useState(false);

    const copyLink = async () => {
        await copyText(`${location.origin}/#${state.id}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="columns">
            <section className="panel">
                <h2>Table {state.id}</h2>
                <button onClick={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
                <p className="muted">
                    {state.cube.name} · {state.cube.size} cards
                </p>
                {state.cube.warnings.map((w) => (
                    <p key={w} className="warn">
                        {w}
                    </p>
                ))}

                <ul className="players">
                    {state.players.map((p) => (
                        <li key={p.id}>
                            <span className={p.ready ? 'badge ready' : 'badge'}>{p.ready ? 'Ready' : 'Not ready'}</span>
                            <span className="name">
                                {p.name}
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
                    {isHost && (
                        <button onClick={() => send({ t: 'addBot' })} disabled={state.players.length >= LIMITS.maxPlayers}>
                            Add bot
                        </button>
                    )}
                </div>
            </section>

            <section className="panel">
                <h2>Settings</h2>
                <label className="field">
                    Packs per player
                    <select
                        disabled={!isHost}
                        value={packsPerPlayer}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer: Number(e.target.value), cardsPerPack, botStrategy })}
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
                        onChange={(e) => send({ t: 'settings', packsPerPlayer, cardsPerPack: Number(e.target.value), botStrategy })}
                    >
                        {range(LIMITS.minCardsPerPack, LIMITS.maxCardsPerPack).map((n) => (
                            <option key={n}>{n}</option>
                        ))}
                    </select>
                </label>
                <label className="field">
                    Bot strategy
                    <select
                        disabled={!isHost}
                        value={botStrategy}
                        onChange={(e) => send({ t: 'settings', packsPerPlayer, cardsPerPack, botStrategy: e.target.value as BotStrategy })}
                    >
                        <option value="smart">Smart (colors and card strength)</option>
                        <option value="random">Random</option>
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
