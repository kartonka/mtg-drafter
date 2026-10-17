import { useRef, useState } from 'react';
import type { Card } from '../../shared/protocol';

export function useHoverCardPreview() {
    const [preview, setPreview] = useState<Card | null>(null);
    const timer = useRef<number | null>(null);
    const clearTimer = () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
    };
    const show = (card: Card) => {
        clearTimer();
        setPreview(card);
    };
    const hide = () => {
        clearTimer();
        timer.current = window.setTimeout(() => setPreview(null), 250);
    };
    const keep = clearTimer;
    const clear = () => {
        clearTimer();
        setPreview(null);
    };
    return { preview, show, hide, keep, clear };
}
