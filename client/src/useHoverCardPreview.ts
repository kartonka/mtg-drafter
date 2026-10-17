import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../shared/protocol';

export function useHoverCardPreview() {
    const [preview, setPreview] = useState<Card | null>(null);
    const showTimer = useRef<number | null>(null);
    const hideTimer = useRef<number | null>(null);
    const clearShowTimer = () => {
        if (showTimer.current !== null) window.clearTimeout(showTimer.current);
        showTimer.current = null;
    };
    const clearHideTimer = () => {
        if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
    };
    const clearTimers = () => {
        clearShowTimer();
        clearHideTimer();
    };
    useEffect(() => clearTimers, []);

    const show = (card: Card) => {
        clearTimers();
        setPreview(null);
        showTimer.current = window.setTimeout(() => {
            showTimer.current = null;
            setPreview(card);
        }, 1000);
    };
    const hide = () => {
        clearShowTimer();
        clearHideTimer();
        hideTimer.current = window.setTimeout(() => {
            hideTimer.current = null;
            setPreview(null);
        }, 500);
    };
    const keep = clearHideTimer;
    const clear = () => {
        clearTimers();
        setPreview(null);
    };
    return { preview, show, hide, keep, clear };
}
