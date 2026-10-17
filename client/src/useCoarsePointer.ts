import { useEffect, useState } from 'react';

const QUERY = '(pointer: coarse)';

/** True when the primary input is a finger, where hover and HTML5 drag-and-drop are unreliable. */
export function useCoarsePointer() {
    const [coarse, setCoarse] = useState(() => matchMedia(QUERY).matches);
    useEffect(() => {
        const media = matchMedia(QUERY);
        const update = () => setCoarse(media.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    return coarse;
}
