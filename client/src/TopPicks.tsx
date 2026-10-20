import { useEffect, useMemo, useState } from 'react';
import type { Card } from '../../shared/protocol';

type RankedCard = { card: Card; count: number };
type TopPicksData = { players: string[]; humanByPlayer: Record<string, RankedCard[]>; bots: RankedCard[] };

export function TopPicks({ cubeName }: { cubeName: string }) {
    const [data, setData] = useState<TopPicksData | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [error, setError] = useState('');
    useEffect(() => {
        setData(null);
        setError('');
        fetch(`/api/top-picks?cubeName=${encodeURIComponent(cubeName)}`).then(async (response) => {
            const result = await response.json();
            if (!response.ok) throw new Error(result.message ?? 'Could not load top picks.');
            const loaded = result as TopPicksData;
            setData(loaded);
            setSelected(loaded.players);
        }).catch((err) => setError(err instanceof Error ? err.message : 'Could not load top picks.'));
    }, [cubeName]);

    const human = useMemo(() => {
        const counts = new Map<string, RankedCard>();
        for (const player of selected) for (const item of data?.humanByPlayer[player] ?? []) {
            const existing = counts.get(item.card.id);
            if (existing) existing.count += item.count;
            else counts.set(item.card.id, { ...item });
        }
        return [...counts.values()].sort((a, b) => b.count - a.count || a.card.name.localeCompare(b.card.name));
    }, [data, selected]);

    const toggle = (name: string) => setSelected((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
    return <section className="panel top-picks-page">
        <div className="review-title"><div><h2>Pick statistics</h2><span className="muted">First picks from completed draft logs · {cubeName}</span></div></div>
        {error && <div className="error">{error}</div>}
        {!data && !error && <p className="muted">Loading top picks…</p>}
        {data && <>
            <section className="panel top-picks-filter">
                <h3>Non-bot players</h3>
                <div className="player-checkboxes">
                    {data.players.map((player) => <label key={player}><input type="checkbox" checked={selected.includes(player)} onChange={() => toggle(player)} />{player}</label>)}
                    {data.players.length === 0 && <span className="muted">No non-bot first picks found.</span>}
                </div>
            </section>
            <div className="columns top-picks-columns">
                <TopPickList title="Non-bot first picks" items={human} />
                <TopPickList title="Bot first picks" items={data.bots} />
            </div>
        </>}
    </section>;
}

function TopPickList({ title, items }: { title: string; items: RankedCard[] }) {
    return <section className="panel"><h3>{title}</h3>
        {items.length === 0 ? <p className="muted">No picks to show.</p> : <ol className="top-pick-list">
            {items.map(({ card, count }) => <li key={card.id}><img src={card.image} alt="" /><span>{card.name}</span><strong>{count}</strong></li>)}
        </ol>}
    </section>;
}
