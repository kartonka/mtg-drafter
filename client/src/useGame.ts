import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMsg, DraftReviewView, ServerMsg, TableView } from '../../shared/protocol';

const STORAGE_KEY = 'mtg-drafter-session';

interface Stored {
    tableId: string;
    token: string;
}

const readStored = (): Stored | null => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
        return null;
    }
};

export const hashReviewCode = () => {
    const value = location.hash.slice(1).toUpperCase();
    return value.startsWith('REVIEW-') ? value.slice('REVIEW-'.length) : '';
};
export const hashCode = () => hashReviewCode() ? '' : location.hash.slice(1).toUpperCase();

export function useGame() {
    const [state, setState] = useState<TableView | null>(null);
    const [review, setReview] = useState<DraftReviewView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [connected, setConnected] = useState(false);
    const [busy, setBusy] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const pendingStartRef = useRef<Extract<ClientMsg, { t: 'create' | 'createSaved' | 'join' }> | null>(null);

    useEffect(() => {
        let disposed = false;
        let retry: number | undefined;

        const connect = () => {
            const proto = location.protocol === 'https:' ? 'wss' : 'ws';
            const ws = new WebSocket(`${proto}://${location.host}/ws`);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnected(true);
                if (pendingStartRef.current) {
                    ws.send(JSON.stringify(pendingStartRef.current satisfies ClientMsg));
                    pendingStartRef.current = null;
                    return;
                }
                const stored = readStored();
                if (hashReviewCode()) {
                    ws.send(JSON.stringify({ t: 'review', tableId: hashReviewCode() } satisfies ClientMsg));
                } else if (stored && (!hashCode() || hashCode() === stored.tableId)) {
                    ws.send(JSON.stringify({ t: 'resume', ...stored } satisfies ClientMsg));
                }
            };

            ws.onmessage = (e) => {
                const msg: ServerMsg = JSON.parse(e.data);
                if (msg.t === 'session') {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tableId: msg.tableId, token: msg.token }));
                    history.replaceState(null, '', `#${msg.tableId}`);
                } else if (msg.t === 'state') {
                    setState(msg.state);
                    setError(null);
                    setBusy(false);
                } else if (msg.t === 'review') {
                    setReview(msg.review);
                    setError(null);
                    setBusy(false);
                } else {
                    setBusy(false);
                    if (msg.code === 'NO_TABLE') {
                        localStorage.removeItem(STORAGE_KEY);
                        setState(null);
                        if (msg.message !== 'Table not found.') setError(msg.message);
                    } else {
                        setError(msg.message);
                    }
                }
            };

            ws.onclose = () => {
                setConnected(false);
                if (!disposed) retry = window.setTimeout(connect, 1500);
            };
        };

        connect();
        return () => {
            disposed = true;
            window.clearTimeout(retry);
            wsRef.current?.close();
        };
    }, []);

    const send = useCallback((msg: ClientMsg) => {
        const ws = wsRef.current;
        if (ws?.readyState !== WebSocket.OPEN) {
            if (msg.t === 'create' || msg.t === 'createSaved' || msg.t === 'join') {
                pendingStartRef.current = msg;
                setBusy(true);
                setError(null);
                return;
            }
            return setError('Not connected to the server.');
        }
        setError(null);
        if (msg.t === 'create' || msg.t === 'createSaved' || msg.t === 'join') setBusy(true);
        if (msg.t === 'review') {
            setBusy(true);
            history.replaceState(null, '', `#review-${msg.tableId.toUpperCase()}`);
        }
        if (msg.t === 'leave') {
            localStorage.removeItem(STORAGE_KEY);
            history.replaceState(null, '', location.pathname);
            setState(null);
        }
        ws.send(JSON.stringify(msg));
    }, []);

    const clearReview = useCallback(() => {
        setReview(null);
        history.replaceState(null, '', state ? `#${state.id}` : `${location.pathname}${location.search}`);
    }, [state]);

    return { state, review, error, connected, busy, send, clearReview, clearError: () => setError(null) };
}
