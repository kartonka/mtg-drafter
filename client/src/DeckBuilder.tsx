import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { Card, DeckLayout } from '../../shared/protocol';
import { copyText } from './clipboard';
import { exportProxyPdf } from './proxyPdf';
import { useCoarsePointer } from './useCoarsePointer';
import { ZoomOverlay } from './ZoomOverlay';
import { CardPreview } from './CardPreview';
import { useLongPressPreview } from './useLongPressPreview';
import { useHoverCardPreview } from './useHoverCardPreview';

type GroupMode = 'cmc' | 'color' | 'type';

/** Deck columns hold card ids, left to right. Basic lands are deck-only instances with ids like `b:Forest:x7k2`. */
type Layout = DeckLayout;

type DropTarget = { kind: 'column'; index: number } | { kind: 'gap'; index: number } | { kind: 'pool' };

const CMC_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+', 'Lands'];
const COLOR_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Lands'];
const TYPE_ORDER = ['Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Planeswalkers', 'Battles', 'Lands', 'Other'];
const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

const isBasic = (id: string) => id.startsWith('b:');
const byCmcThenName = (a: Card, b: Card) => a.cmc - b.cmc || a.name.localeCompare(b.name);
const byName = (a: Card, b: Card) => a.name.localeCompare(b.name);

function groupLabel(c: Card, mode: GroupMode): string {
    if (c.land) return 'Lands';
    if (mode === 'cmc') return c.cmc >= 7 ? '7+' : String(Math.floor(c.cmc));
    if (mode === 'type') {
        const line = c.typeLine ?? '';
        if (/\bCreature\b/.test(line)) return 'Creatures';
        if (/\bInstant\b/.test(line)) return 'Instants';
        if (/\bSorcery\b/.test(line)) return 'Sorceries';
        if (/\bEnchantment\b/.test(line)) return 'Enchantments';
        if (/\bArtifact\b/.test(line)) return 'Artifacts';
        if (/\bPlaneswalker\b/.test(line)) return 'Planeswalkers';
        if (/\bBattle\b/.test(line)) return 'Battles';
        return 'Other';
    }
    if (c.colors.length === 0) return 'Colorless';
    return c.colors.length > 1 ? 'Multicolor' : (COLOR_NAMES[c.colors[0]] ?? 'Colorless');
}

function group(cards: Card[], mode: GroupMode): Card[][] {
    const order = mode === 'cmc' ? CMC_ORDER : mode === 'color' ? COLOR_ORDER : TYPE_ORDER;
    return order
        .map((label) => cards.filter((c) => groupLabel(c, mode) === label).sort(byName))
        .filter((g) => g.length > 0);
}

const cmcRank = (c: Card) => CMC_ORDER.indexOf(groupLabel(c, 'cmc'));

function readLayout(key: string): Layout {
    try {
        const v = JSON.parse(localStorage.getItem(key) ?? 'null');
        if (Array.isArray(v?.columns) && Array.isArray(v?.pool)) return v;
    } catch {
        // fall through to an empty layout
    }
    return { columns: [], pool: [] };
}

/** Appends to the first column with the same mana value (lands count as their own), else opens a new column in order. */
function autoPlace(columns: string[][], id: string, cardOf: (id: string) => Card | undefined) {
    const rank = cmcRank(cardOf(id)!);
    const i = columns.findIndex((col) => cmcRank(cardOf(col[0])!) >= rank);
    if (i >= 0 && cmcRank(cardOf(columns[i][0])!) === rank) columns[i].push(id);
    else columns.splice(i < 0 ? columns.length : i, 0, [id]);
}

interface Props {
    picks: Card[];
    basics: Card[];
    /** Per player and table; keeps the deck across reloads. */
    storageKey: string;
    done: boolean;
    initialLayout?: DeckLayout;
    persistLocal?: boolean;
    onSave?: (layout: DeckLayout) => void;
}

export function DeckBuilder({ picks, basics, storageKey, done, initialLayout, persistLocal = true, onSave }: Props) {
    const [raw, setRaw] = useState(() => initialLayout ?? readLayout(storageKey));
    const lastSaved = useRef('');
    const hoverPreview = useHoverCardPreview();
    const [copied, setCopied] = useState('');
    const [exporting, setExporting] = useState(false);
    const [dragId, setDragId] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const touch = useCoarsePointer();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [zoom, setZoom] = useState<Card | null>(null);
    const longPress = useLongPressPreview(setZoom);

    const cardOf = useMemo(() => {
        const picked = new Map(picks.map((c) => [c.id, c]));
        const basicByName = new Map(basics.map((c) => [c.name, c]));
        return (id: string): Card | undefined => {
            if (!isBasic(id)) return picked.get(id);
            const basic = basicByName.get(id.split(':')[1]);
            return basic && { ...basic, id };
        };
    }, [picks, basics]);

    // New picks land in the deck automatically; stale ids are dropped.
    const layout = useMemo<Layout>(() => {
        const seen = new Set<string>();
        const keep = (id: string) => !!cardOf(id) && !seen.has(id) && !!seen.add(id);
        const columns = raw.columns.map((col) => col.filter(keep)).filter((col) => col.length > 0);
        const pool = raw.pool.filter(keep);
        for (const c of picks.filter((c) => !seen.has(c.id)).sort(byCmcThenName)) autoPlace(columns, c.id, cardOf);
        return { columns, pool };
    }, [raw, picks, cardOf]);

    const deckCards = layout.columns.flat().map((id) => cardOf(id)!);
    const poolCards = layout.pool.map((id) => cardOf(id)!).sort(byCmcThenName);
    const typeStats = TYPE_ORDER
        .map((type) => ({ type, count: deckCards.filter((card) => groupLabel(card, 'type') === type).length }))
        .filter(({ count }) => count > 0);

    const commit = (next: Layout) => {
        setRaw(next);
        if (persistLocal) localStorage.setItem(storageKey, JSON.stringify(next));
    };

    useEffect(() => {
        if (!done || !onSave) return;
        const serialized = JSON.stringify(layout);
        if (serialized === lastSaved.current) return;
        lastSaved.current = serialized;
        onSave(layout);
    }, [done, layout, onSave]);

    const moveTo = (id: string, target: DropTarget) => {
        const columns = layout.columns.map((col) => col.filter((x) => x !== id));
        const pool = layout.pool.filter((x) => x !== id);
        if (target.kind === 'pool') {
            if (!isBasic(id)) pool.push(id);
        } else if (target.kind === 'column') {
            columns[target.index].push(id);
        } else {
            columns.splice(target.index, 0, [id]);
        }
        commit({ columns: columns.filter((col) => col.length > 0), pool });
    };

    const clickCard = (id: string) => {
        hoverPreview.clear();
        if (touch) return setSelectedId(selectedId === id ? null : id);
        if (layout.pool.includes(id)) {
            const columns = layout.columns.map((col) => [...col]);
            autoPlace(columns, id, cardOf);
            commit({ columns, pool: layout.pool.filter((x) => x !== id) });
        } else {
            moveTo(id, { kind: 'pool' });
        }
    };

    // Touch screens can't drag reliably, so a selected card gets move buttons instead.
    const selected = selectedId && cardOf(selectedId) ? selectedId : null;
    const selectedColumn = selected ? layout.columns.findIndex((col) => col.includes(selected)) : -1;
    const lastColumn = layout.columns.length - 1;
    const canSplit = selectedColumn >= 0 && layout.columns[selectedColumn].length > 1;
    const moveSelected = (direction: -1 | 1) => {
        if (!selected) return;
        const target = selectedColumn + direction;
        if (target >= 0 && target <= lastColumn) moveTo(selected, { kind: 'column', index: target });
        else if (canSplit) moveTo(selected, { kind: 'gap', index: direction < 0 ? 0 : layout.columns.length });
    };
    const selectedToDeck = () => {
        if (!selected) return;
        const columns = layout.columns.map((col) => [...col]);
        autoPlace(columns, selected, cardOf);
        commit({ columns, pool: layout.pool.filter((x) => x !== selected) });
    };

    const arrange = (mode: GroupMode) =>
        commit({ columns: group(deckCards, mode).map((g) => g.map((c) => c.id)), pool: layout.pool });

    const basicCount = (name: string) => deckCards.filter((c) => isBasic(c.id) && c.name === name).length;
    const addBasic = (name: string) => {
        const id = `b:${name}:${Math.random().toString(36).slice(2, 8)}`;
        const columns = layout.columns.map((col) => [...col]);
        autoPlace(columns, id, cardOf);
        commit({ columns, pool: layout.pool });
    };
    const removeBasic = (name: string) => {
        const id = [...deckCards].reverse().find((c) => isBasic(c.id) && c.name === name)?.id;
        if (id) moveTo(id, { kind: 'pool' });
    };

    const copy = async (label: string, cards: Card[]) => {
        const counts = new Map<string, number>();
        for (const c of cards) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
        await copyText([...counts].map(([name, n]) => `${n} ${name}`).join('\n'));
        setCopied(label);
        setTimeout(() => setCopied(''), 1500);
    };

    const exportPdf = async () => {
        setExporting(true);
        try {
            await exportProxyPdf(deckCards, 'deck-proxies.pdf');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Could not create the PDF.');
        } finally {
            setExporting(false);
        }
    };

    const dragProps = (id: string) =>
        touch
            ? { draggable: false }
            : {
                draggable: true,
                onDragStart: (e: DragEvent) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', id);
                    setDragId(id);
                    hoverPreview.clear();
                },
                onDragEnd: () => {
                    setDragId(null);
                    setOver(null);
                },
            };

    const zone = (key: string, target: DropTarget) => ({
        onDragOver: (e: DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            setOver(key);
        },
        onDragLeave: () => setOver(null),
        onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (dragId) moveTo(dragId, target);
            setDragId(null);
            setOver(null);
        },
    });

    const cls = (base: string, key: string) => `${base}${dragId ? ' active' : ''}${over === key ? ' over' : ''}`;
    const gap = (index: number) => <div className={cls('gap', `gap${index}`)} {...zone(`gap${index}`, { kind: 'gap', index })} />;

    return (
        <div className="deckbuilder">
            <div className="draft-header">
                <h2>{done ? 'Draft complete' : 'Deck builder'}</h2>
                <span className="muted">
                    {touch
                        ? 'Tap a card to select it, then use the buttons at the bottom to move it.'
                        : 'Drag cards between columns, into a gap to start a new column, or click a card to move it in or out of the deck.'}
                </span>
            </div>

            <div className="section-header">
                <h3>
                    Deck ({deckCards.length}) <span className="muted">· {deckCards.filter((c) => c.land).length} lands</span>
                </h3>
                <button onClick={() => arrange('cmc')} disabled={deckCards.length === 0}>
                    Arrange by mana value
                </button>
                <button onClick={() => arrange('color')} disabled={deckCards.length === 0}>
                    Arrange by color
                </button>
                <button onClick={() => arrange('type')} disabled={deckCards.length === 0}>
                    Arrange by card type
                </button>
                <button onClick={() => copy('deck', deckCards)} disabled={deckCards.length === 0}>
                    {copied === 'deck' ? 'Copied!' : 'Copy deck list'}
                </button>
                <button onClick={exportPdf} disabled={deckCards.length === 0 || exporting}>
                    {exporting ? 'Creating PDF…' : 'Export proxies (PDF)'}
                </button>
            </div>

            {done && basics.length > 0 && (
                <div className="basics">
                    <span className="muted">Basic lands</span>
                    {basics.map((b) => (
                        <span key={b.id} className="basic">
                            <button onClick={() => removeBasic(b.name)} disabled={basicCount(b.name) === 0}>
                                −
                            </button>
                            <span onMouseEnter={() => hoverPreview.show(b)} onMouseLeave={hoverPreview.hide}>
                                {b.name} {basicCount(b.name)}
                            </span>
                            <button onClick={() => addBasic(b.name)}>+</button>
                        </span>
                    ))}
                </div>
            )}

            {done && (
                <section className="type-stats" aria-label="Deck card type counts">
                    <strong>Card types</strong>
                    {typeStats.map(({ type, count }) => (
                        <span className="type-stat" key={type}>{type} <b>{count}</b></span>
                    ))}
                    {typeStats.length === 0 && <span className="muted">No cards in deck.</span>}
                </section>
            )}

            <div className="columns-row">
                {layout.columns.length === 0 && (
                    <div className={cls('empty-deck', 'gap0')} {...zone('gap0', { kind: 'gap', index: 0 })}>
                        Drop cards here to add them to the deck
                    </div>
                )}
                {layout.columns.map((col, i) => (
                    <div key={i} className="column-with-gap">
                        {gap(i)}
                        <div className={cls('stack', `col${i}`)} {...zone(`col${i}`, { kind: 'column', index: i })}>
                            {col.map((id) => {
                                const c = cardOf(id)!;
                                return (
                                    <img
                                        key={id}
                                        src={c.image}
                                        alt={c.name}
                                        className={id === selected ? 'stack-card selected' : 'stack-card'}
                                        onMouseEnter={() => hoverPreview.show(c)}
                                        onMouseLeave={hoverPreview.hide}
                                        {...longPress.bind(c)}
                                        onClick={() => { if (!longPress.consumeClick()) clickCard(id); }}
                                        {...dragProps(id)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
                {layout.columns.length > 0 && gap(layout.columns.length)}
            </div>

            <div className="section-header">
                <h3>Pool ({poolCards.length})</h3>
                <button onClick={() => copy('all', picks)} disabled={picks.length === 0}>
                    {copied === 'all' ? 'Copied!' : 'Copy all picks'}
                </button>
            </div>
            <div className={cls('pool-grid', 'pool')} {...zone('pool', { kind: 'pool' })}>
                {poolCards.length === 0 && <span className="muted">Drop cards here to take them out of the deck.</span>}
                {poolCards.map((c) => (
                    <img
                        key={c.id}
                        src={c.image}
                        alt={c.name}
                        className={c.id === selected ? 'pool-card selected' : 'pool-card'}
                        onClick={() => { if (!longPress.consumeClick()) clickCard(c.id); }}
                        onMouseEnter={() => hoverPreview.show(c)}
                        onMouseLeave={hoverPreview.hide}
                        {...longPress.bind(c)}
                        {...dragProps(c.id)}
                    />
                ))}
            </div>

            {hoverPreview.preview && <CardPreview className="deck-preview" card={hoverPreview.preview} onMouseEnter={hoverPreview.keep} onMouseLeave={hoverPreview.hide} />}

            {touch && selected && (
                <>
                    <div className="bar-spacer" />
                    <div className="action-bar">
                        <span className="muted">{cardOf(selected)!.name}</span>
                        {selectedColumn >= 0 ? (
                            <>
                                <button onClick={() => moveSelected(-1)} disabled={selectedColumn === 0 && !canSplit}>
                                    ◀ Left
                                </button>
                                <button onClick={() => moveSelected(1)} disabled={selectedColumn === lastColumn && !canSplit}>
                                    Right ▶
                                </button>
                                <button onClick={() => moveTo(selected, { kind: 'gap', index: selectedColumn + 1 })} disabled={!canSplit}>
                                    New column
                                </button>
                                <button onClick={() => moveTo(selected, { kind: 'pool' })}>{isBasic(selected) ? 'Remove' : 'To pool'}</button>
                            </>
                        ) : (
                            <button className="primary" onClick={selectedToDeck}>
                                To deck
                            </button>
                        )}
                        <button onClick={() => setZoom(cardOf(selected)!)}>Zoom</button>
                        <button className="link" onClick={() => setSelectedId(null)}>
                            Done
                        </button>
                    </div>
                </>
            )}
            {zoom && <ZoomOverlay card={zoom} onClose={() => setZoom(null)} />}
        </div>
    );
}
