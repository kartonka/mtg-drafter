import { useState } from 'react';
import type { TableView } from '../../shared/protocol';

export function Results({ state }: { state: TableView }) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(state.picks.map((c) => `1 ${c.name}`).join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div>
            <div className="draft-header">
                <h2>Draft complete: {state.picks.length} cards</h2>
                <button onClick={copy}>{copied ? 'Copied!' : 'Copy card list'}</button>
            </div>
            <div className="grid">
                {state.picks.map((c) => (
                    <img key={c.id} src={c.image} alt={c.name} title={c.name} className="card" />
                ))}
            </div>
        </div>
    );
}
