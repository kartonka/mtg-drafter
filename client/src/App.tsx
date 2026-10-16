import { useState } from 'react';
import { BotPicks } from './BotPicks';
import { DeckBuilder } from './DeckBuilder';
import { Draft } from './Draft';
import { Lobby } from './Lobby';
import { hashCode, useGame } from './useGame';

export function App() {
    const { state, error, connected, busy, send } = useGame();
    const [view, setView] = useState<'draft' | 'deck'>('draft');
    const deckKey = state && `mtg-drafter-deck-${state.id}-${state.you}`;

    return (
        <div className="app">
            <header className="topbar">
                <h1>MTG Cube Drafter</h1>
                <span className={connected ? 'dot on' : 'dot'} title={connected ? 'Connected' : 'Reconnecting…'} />
                {state && (
                    <button className="link" onClick={() => confirm('Leave this table?') && send({ t: 'leave' })}>
                        Leave table
                    </button>
                )}
            </header>
            {error && <div className="error">{error}</div>}
            <main>
                {!state && <Home busy={busy} send={send} />}
                {state?.phase === 'lobby' && <Lobby state={state} send={send} />}
                {state?.phase === 'drafting' && deckKey && (
                    <>
                        <nav className="tabs">
                            <button className={view === 'draft' ? 'active' : ''} onClick={() => setView('draft')}>
                                Draft{state.draft?.pack ? ' •' : ''}
                            </button>
                            <button className={view === 'deck' ? 'active' : ''} onClick={() => setView('deck')}>
                                Deck ({state.picks.length})
                            </button>
                        </nav>
                        {view === 'draft' ? (
                            <Draft state={state} send={send} />
                        ) : (
                            <DeckBuilder picks={state.picks} basics={state.basics} storageKey={deckKey} done={false} />
                        )}
                    </>
                )}
                {state?.phase === 'done' && deckKey && (
                    <>
                        <DeckBuilder picks={state.picks} basics={state.basics} storageKey={deckKey} done />
                        {state.botPicks.length > 0 && <BotPicks bots={state.botPicks} />}
                    </>
                )}
            </main>
        </div>
    );
}

function Home({ busy, send }: { busy: boolean; send: ReturnType<typeof useGame>['send'] }) {
    const [name, setName] = useState(() => localStorage.getItem('mtg-drafter-name') ?? '');
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [pasteMode, setPasteMode] = useState(false);
    const [code, setCode] = useState(hashCode());

    const remember = () => localStorage.setItem('mtg-drafter-name', name.trim());

    return (
        <div className="home">
            <label className="field">
                Your name
                <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </label>

            <div className="columns">
                <section className="panel">
                    <h2>Create a table</h2>
                    {pasteMode ? (
                        <label className="field">
                            Card list (one card per line)
                            <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Lightning Bolt\n1 Counterspell'} />
                        </label>
                    ) : (
                        <label className="field">
                            Moxfield cube link
                            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://moxfield.com/cubes/…" />
                        </label>
                    )}
                    <button className="link" onClick={() => setPasteMode(!pasteMode)}>
                        {pasteMode ? 'Use a Moxfield link instead' : 'Paste a card list instead'}
                    </button>
                    <button
                        className="primary"
                        disabled={busy || !name.trim() || !(pasteMode ? text.trim() : url.trim())}
                        onClick={() => {
                            remember();
                            send({ t: 'create', name, cube: pasteMode ? { text } : { url } });
                        }}
                    >
                        {busy ? 'Loading cube…' : 'Create table'}
                    </button>
                </section>

                <section className="panel">
                    <h2>Join a table</h2>
                    <label className="field">
                        Table code
                        <input value={code} maxLength={8} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCDE" />
                    </label>
                    <button
                        className="primary"
                        disabled={busy || !name.trim() || !code.trim()}
                        onClick={() => {
                            remember();
                            send({ t: 'join', tableId: code.trim(), name });
                        }}
                    >
                        Join
                    </button>
                </section>
            </div>
        </div>
    );
}
