import { useEffect, useRef, useState } from 'react';
import type { Card } from '../../shared/protocol';

type PreviewPosition = { left: number; top: number };

const PREVIEW_GAP = 16;
const VIEWPORT_MARGIN = 12;
const PREVIEW_WIDTH = 764;
const PREVIEW_HEIGHT = 560;

export function useHoverCardPreview() {
    const [preview, setPreview] = useState<Card | null>(null);
    const [position, setPosition] = useState<PreviewPosition>({ left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN });
    const pointer = useRef({ x: 0, y: 0 });
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
        pointer.current = { x: pointerX, y: pointerY };
        setPosition(getPosition(pointerX, pointerY));
        showTimer.current = window.setTimeout(() => {
            showTimer.current = null;
            setPreview(card);
        }, 1500);
    };
    const getPosition = (x: number, y: number): PreviewPosition => {
        const width = Math.min(PREVIEW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
        const height = Math.min(PREVIEW_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2);
        const right = window.innerWidth - VIEWPORT_MARGIN;
        const bottom = window.innerHeight - VIEWPORT_MARGIN;
        const left = x + PREVIEW_GAP + width <= right
            ? x + PREVIEW_GAP
            : x - PREVIEW_GAP - width >= VIEWPORT_MARGIN
                ? x - PREVIEW_GAP - width
                : Math.max(VIEWPORT_MARGIN, Math.min(x - width / 2, right - width));
        const top = Math.max(VIEWPORT_MARGIN, Math.min(y - 24, bottom - height));
        return { left, top };
    };
    useEffect(() => {
        const reposition = () => setPosition(getPosition(pointer.current.x, pointer.current.y));
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, []);
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
