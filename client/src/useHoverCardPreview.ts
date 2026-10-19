import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../shared/protocol';

type PreviewPosition = { left: number; top: number };

export function useHoverCardPreview() {
    const [preview, setPreview] = useState<Card | null>(null);
    const [position, setPosition] = useState<PreviewPosition>({ left: 0, top: 16 });
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

    const show = (card: Card, pointerX: number, pointerY: number) => {
        clearTimers();
        setPreview(null);
        const width = Math.min(764, window.innerWidth - 32);
        const height = Math.min(window.innerHeight - 32, 720);
        const left = pointerX < window.innerWidth / 2
            ? Math.min(window.innerWidth - width - 16, pointerX + 24)
            : Math.max(16, pointerX - width - 24);
        const top = Math.max(16, Math.min(pointerY - 24, window.innerHeight - height - 16));
        setPosition({ left, top });
        showTimer.current = window.setTimeout(() => {
            showTimer.current = null;
            setPreview(card);
        }, 1500);
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
    return { preview, position, show, hide, keep, clear };
}
