import { useState } from 'react';

const PLAYLIST_ID = 'PLt3HR7cu4NMNUoQx1q5ullRMW-ZwosuNl';
const PLAYLIST_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;
const EMBED_URL = `https://www.youtube.com/embed?listType=playlist&list=${PLAYLIST_ID}&autoplay=1&playsinline=1`;

export function PlaylistPlayer() {
    const [playing, setPlaying] = useState(false);

    return (
        <>
            <button className={playing ? 'playlist-button active' : 'playlist-button'} onClick={() => setPlaying((value) => !value)}>
                {playing ? '■ Stop MTGRemy' : '▶ Play MTGRemy'}
            </button>
            {playing && (
                <aside className="playlist-player" aria-label="MTGRemy YouTube playlist player">
                    <div className="playlist-player-header">
                        <strong>MTGRemy playlist</strong>
                        <button className="link" onClick={() => setPlaying(false)} aria-label="Close playlist player">✕</button>
                    </div>
                    <iframe
                        src={EMBED_URL}
                        title="MTGRemy playlist"
                        allow="autoplay; encrypted-media; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                    />
                    <a href={PLAYLIST_URL} target="_blank" rel="noreferrer">Open playlist on YouTube</a>
                </aside>
            )}
        </>
    );
}
