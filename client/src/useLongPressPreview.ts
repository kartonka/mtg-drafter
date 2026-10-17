import { useEffect, useRef, type MouseEvent, type TouchEvent } from 'react';
import type { Card } from '../../shared/protocol';
import { backFaceImage } from './cardFaces';

export function useLongPressPreview(onPreview: (card: Card) => void) {
    const timer = useRef<number | null>(null);
    const triggered = useRef(false);
    const clear = () => {
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = null;
    };

    useEffect(() => clear, []);

    const bind = (card: Card) => ({
        onTouchStart: (_event: TouchEvent<HTMLElement>) => {
            if (!backFaceImage(card)) return;
            clear();
            timer.current = window.setTimeout(() => {
                triggered.current = true;
                onPreview(card);
                window.setTimeout(() => { triggered.current = false; }, 1200);
            }, 500);
        },
        onTouchEnd: clear,
        onTouchCancel: clear,
        onTouchMove: clear,
        onContextMenu: (event: MouseEvent<HTMLElement>) => {
            if (backFaceImage(card)) event.preventDefault();
        },
    });

    const consumeClick = () => {
        if (!triggered.current) return false;
        triggered.current = false;
        return true;
    };

    return { bind, consumeClick };
}
