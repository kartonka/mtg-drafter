import { useEffect, useState } from 'react';
import { BotPicks } from './BotPicks';
import { DeckBuilder } from './DeckBuilder';
import { Draft } from './Draft';
import { DraftReview } from './DraftReview';
import { Lobby } from './Lobby';
import { hashCode, hashReviewCode, useGame } from './useGame';

export function App() {
    const { state, review, error, connected, busy, send, clearReview } = useGame();
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
                {!state && !review && <Home busy={busy} send={send} />}
                {review && <DraftReview review={review} onClose={clearReview} />}
                {!review && state?.phase === 'lobby' && <Lobby state={state} send={send} />}
                {!review && state?.phase === 'drafting' && deckKey && (
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
                {!review && state?.phase === 'done' && deckKey && (
                    <>
                        <nav className="tabs">
                            <button className={view === 'deck' ? 'active' : ''} onClick={() => setView('deck')}>Deck</button>
                            <button onClick={() => send({ t: 'review', tableId: state.id })}>Review draft</button>
                        </nav>
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
    const [code, setCode] = useState(hashCode());
    const [reviewCode, setReviewCode] = useState(hashReviewCode() || hashCode());
    const [savedCubes, setSavedCubes] = useState<{ name: string }[]>([]);
    const [selectedCube, setSelectedCube] = useState('');
    const [cubeName, setCubeName] = useState('');
    const [saving, setSaving] = useState(false);
    const [libraryMessage, setLibraryMessage] = useState('');

    const refreshSavedCubes = async (selectName?: string) => {
        const response = await fetch('/api/cubes');
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? 'Could not load saved cube lists.');
        const cubes: { name: string }[] = result.cubes ?? [];
        setSavedCubes(cubes);
        setSelectedCube((current) => selectName ?? (cubes.some((cube) => cube.name === current) ? current : cubes[0]?.name ?? ''));
    };

    useEffect(() => {
        refreshSavedCubes().catch((err) => setLibraryMessage(err instanceof Error ? err.message : 'Could not load saved cube lists.'));
    }, []);

    const remember = () => localStorage.setItem('mtg-drafter-name', name.trim());
    const saveList = async () => {
        setSaving(true);
        setLibraryMessage('');
        try {
            const response = await fetch('/api/cubes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: cubeName, text }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? 'Could not save the cube list.');
            await refreshSavedCubes(result.name);
            setLibraryMessage(result.overwritten ? `Updated “${result.name}”.` : `Saved “${result.name}”.`);
        } catch (err) {
            setLibraryMessage(err instanceof Error ? err.message : 'Could not save the cube list.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="home">
            <label className="field">
                Your name
                <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            </label>

            <div className="columns">
                <section className="panel">
                    <h2>Saved cube lists</h2>
                    <label className="field">
                        Cube list
                        <select value={selectedCube} onChange={(e) => setSelectedCube(e.target.value)} disabled={savedCubes.length === 0}>
                            {savedCubes.length === 0 && <option value="">No saved lists</option>}
                            {savedCubes.map((cube) => <option key={cube.name} value={cube.name}>{cube.name}</option>)}
                        </select>
                    </label>
                    <button className="primary" disabled={busy || !name.trim() || !selectedCube} onClick={() => {
                        remember();
                        send({ t: 'createSaved', name, cubeName: selectedCube });
                    }}>
                        {busy ? 'Loading cube…' : 'Create table from saved list'}
                    </button>
                    {libraryMessage && <span className="muted">{libraryMessage}</span>}
                </section>

                <section className="panel">
                    <h2>Upload or replace a cube list</h2>
                    <label className="field">
                        Cube list name
                        <input value={cubeName} maxLength={80} onChange={(e) => setCubeName(e.target.value)} placeholder="My cube" />
                    </label>
                    <label className="field">
                        Card list (one card per line)
                        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'1 Lightning Bolt\n1 Counterspell'} />
                    </label>
                    <span className="muted">Saving a name that already exists replaces that list. Moxfield exports can be pasted here.</span>
                    <button className="primary" disabled={saving || !cubeName.trim() || !text.trim()} onClick={saveList}>
                        {saving ? 'Saving…' : savedCubes.some((cube) => cube.name.toLocaleLowerCase() === cubeName.trim().toLocaleLowerCase()) ? 'Replace saved list' : 'Save cube list'}
                    </button>
                </section>

                <section className="panel">
                    <h2>Use a Moxfield link</h2>
                    <label className="field">
                        Moxfield cube link
                        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://moxfield.com/cubes/…" />
                    </label>
                    <span className="muted">Moxfield may block server requests. Paste its exported card list above if loading fails.</span>
                    <button className="primary" disabled={busy || !name.trim() || !url.trim()} onClick={() => {
                        remember();
                        send({ t: 'create', name, cube: { url } });
                    }}>
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

                <section className="panel">
                    <h2>Review a draft</h2>
                    <label className="field">
                        Table code
                        <input value={reviewCode} maxLength={8} onChange={(e) => setReviewCode(e.target.value.toUpperCase())} placeholder="ABCDE" />
                    </label>
                    <button className="primary" disabled={busy || !reviewCode.trim()} onClick={() => send({ t: 'review', tableId: reviewCode.trim() })}>
                        {busy ? 'Loading draft…' : 'Open review'}
                    </button>
                </section>
            </div>
        </div>
    );
}
