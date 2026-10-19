import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { CubeError, enrichArchivedReview, listSavedCubeLists, loadCube, loadSavedCube, saveCubeList } from './cube';
import { archiveDraftReview, getArchivedDraftReview, listArchivedDraftReviews } from './reviewArchive';
import { GameError, Table, cleanName, makeTableCode } from './table';

const PORT = Number(process.env.PORT ?? 3001);
const MAX_TABLES = 200;
const TABLE_TTL_MS = 12 * 60 * 60 * 1000;

const tables = new Map<string, Table>();
const conns = new WeakMap<WebSocket, { tableId: string; playerId: string }>();
const creating = new WeakSet<WebSocket>();
const archivedInProcess = new Set<string>();
const draftTimers = new WeakMap<Table, Map<string, ReturnType<typeof setTimeout>>>();

const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

function clearPickTimer(table: Table, playerId: string) {
    const timers = draftTimers.get(table);
    const timer = timers?.get(playerId);
    if (timer) clearTimeout(timer);
    timers?.delete(playerId);
    table.setPickDeadline(playerId, null);
}

function arenaPickSeconds(round: number, pick: number) {
    // Arena publishes roughly 70 seconds for P1P1 and 30 seconds by P3P7.
    // Interpolate those milestones, with a short floor for the end of a pack.
    return Math.max(5, 70 - (round - 1) * 8 - (pick - 1) * 4);
}

function syncDraftTimers(table: Table) {
    let timers = draftTimers.get(table);
    if (!timers) {
        timers = new Map();
        draftTimers.set(table, timers);
    }
    const draft = table.draft;
    if (table.settings.timerStrategy === 'off') {
        for (const playerId of timers.keys()) clearPickTimer(table, playerId);
        return;
    }
    if (!draft || table.phase !== 'drafting') {
        for (const playerId of timers.keys()) clearPickTimer(table, playerId);
        return;
    }

    const active = new Set<string>();
    table.players.forEach((player, seat) => {
        if (player.isBot || !draft.currentPack(seat)) return;
        active.add(player.id);
        if (timers!.has(player.id)) return;
        const pick = draft.logs[seat].filter((entry) => entry.round === draft.round + 1).length + 1;
        const arenaSeconds = arenaPickSeconds(draft.round + 1, pick);
        const seconds = table.settings.timerStrategy === 'extended' ? arenaSeconds * 2 : arenaSeconds;
        const deadline = Date.now() + seconds * 1000;
        table.setPickDeadline(player.id, deadline);
        const timer = setTimeout(() => {
            if (timers!.get(player.id) !== timer) return;
            timers!.delete(player.id);
            table.setPickDeadline(player.id, null);
            try {
                table.pickTimedOut(player.id);
            } catch (err) {
                console.error('Automatic draft pick failed:', err);
            }
            broadcast(table);
        }, seconds * 1000);
        timers!.set(player.id, timer);
    });

    for (const playerId of timers.keys()) {
        if (!active.has(playerId)) clearPickTimer(table, playerId);
    }
}

function broadcast(table: Table) {
    syncDraftTimers(table);
    archiveCompletedDraft(table);
    for (const p of table.players) if (p.ws) send(p.ws, { t: 'state', state: table.view(p.id) });
}

function archiveCompletedDraft(table: Table) {
    if (table.phase !== 'done' || archivedInProcess.has(table.id)) return;
    try {
        archiveDraftReview(table.reviewView());
        archivedInProcess.add(table.id);
    } catch (err) {
        console.error('Could not archive completed draft:', err);
    }
}

function attach(ws: WebSocket, table: Table, playerId: string) {
    detach(ws);
    const player = table.player(playerId)!;
    player.ws = ws;
    conns.set(ws, { tableId: table.id, playerId });
    send(ws, { t: 'session', tableId: table.id, token: player.token, playerId });
}

function detach(ws: WebSocket) {
    const conn = conns.get(ws);
    if (!conn) return;
    conns.delete(ws);
    const table = tables.get(conn.tableId);
    const player = table?.player(conn.playerId);
    if (table && player && player.ws === ws) {
        player.ws = null;
        broadcast(table);
    }
}

function dropIfAbandoned(table: Table) {
    // Keep completed drafts available by table code for review until normal TTL cleanup.
    if (table.abandoned && table.phase !== 'done') {
        for (const playerId of draftTimers.get(table)?.keys() ?? []) clearPickTimer(table, playerId);
        tables.delete(table.id);
    }
}

async function handle(ws: WebSocket, msg: ClientMsg) {
    switch (msg.t) {
        case 'create':
        case 'createSaved': {
            if (creating.has(ws)) return;
            if (tables.size >= MAX_TABLES) throw new GameError('The server is busy. Try again later.');
            const name = cleanName(msg.name);
            creating.add(ws);
            try {
                const cube = msg.t === 'createSaved' ? await loadSavedCube(msg.cubeName) : await loadCube(msg.cube ?? {});
                if (ws.readyState !== ws.OPEN) return;
                let id = makeTableCode();
                while (tables.has(id)) id = makeTableCode();
                const table = new Table(id, cube);
                tables.set(id, table);
                const player = table.addHuman(name, ws);
                attach(ws, table, player.id);
                broadcast(table);
            } finally {
                creating.delete(ws);
            }
            return;
        }
        case 'join': {
            const table = tables.get(String(msg.tableId).toUpperCase());
            if (!table) return send(ws, { t: 'error', message: 'No table with that code.' });
            const player = table.addHuman(cleanName(msg.name), ws);
            table.touch();
            attach(ws, table, player.id);
            broadcast(table);
            return;
        }
        case 'resume': {
            const table = tables.get(String(msg.tableId).toUpperCase());
            const player = table?.players.find((p) => p.token && p.token === msg.token);
            if (!table || !player) return send(ws, { t: 'error', message: 'Table not found.', code: 'NO_TABLE' });
            attach(ws, table, player.id);
            broadcast(table);
            return;
        }
        case 'review': {
            const table = tables.get(String(msg.tableId).toUpperCase());
            if (table) {
                table.touch();
                archiveCompletedDraft(table);
            }
            let review = table?.reviewView() ?? getArchivedDraftReview(String(msg.tableId));
            if (!review) return send(ws, { t: 'error', message: 'No completed draft with that table code.' });
            if (!table) {
                const enriched = await enrichArchivedReview(review);
                review = enriched.review;
                if (enriched.changed) {
                    try {
                        archiveDraftReview(review);
                    } catch (err) {
                        console.error('Could not update draft review metadata:', err);
                    }
                }
            }
            send(ws, { t: 'review', review });
            return;
        }
    }

    const conn = conns.get(ws);
    const table = conn && tables.get(conn.tableId);
    if (!conn || !table) return send(ws, { t: 'error', message: 'Not at a table.', code: 'NO_TABLE' });
    table.touch();

    switch (msg.t) {
        case 'ready':
            table.setReady(conn.playerId, msg.ready);
            break;
        case 'addBot':
            table.addBot(conn.playerId);
            break;
        case 'reorder':
            table.reorderPlayers(conn.playerId, msg.playerIds);
            break;
        case 'kick': {
            const targetWs = table.player(String(msg.playerId))?.ws;
            table.kick(conn.playerId, String(msg.playerId));
            if (targetWs) {
                conns.delete(targetWs);
                send(targetWs, { t: 'error', message: 'You were removed from the table.', code: 'NO_TABLE' });
            }
            break;
        }
        case 'settings':
            table.setSettings(conn.playerId, msg.packsPerPlayer, msg.cardsPerPack, msg.pickCount, msg.botStrategy, msg.timerStrategy);
            break;
        case 'start':
            table.start(conn.playerId);
            break;
        case 'reservePick':
            table.reservePick(conn.playerId, msg.cardIds, msg.additionalCardId);
            return;
        case 'saveDeck':
            table.saveDeck(conn.playerId, msg.deck);
            archiveDraftReview(table.reviewView());
            archivedInProcess.add(table.id);
            break;
        case 'pick':
            {
                // Accept the old single-card shape from already-open browser tabs.
                const pick = msg as typeof msg & { cardId?: string; cardIds?: string[] };
                const cardIds = pick.cardIds ?? (pick.cardId ? [pick.cardId] : []);
                table.pick(conn.playerId, cardIds, pick.additionalCardId);
                clearPickTimer(table, conn.playerId);
            }
            break;
        case 'leave':
            conns.delete(ws);
            table.leave(conn.playerId);
            dropIfAbandoned(table);
            break;
    }
    broadcast(table);
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, tables: tables.size }));
app.get('/api/cubes', (_req, res) => {
    try {
        res.json({ cubes: listSavedCubeLists() });
    } catch (err) {
        res.status(500).json({ message: err instanceof Error ? err.message : 'Could not load saved cube lists.' });
    }
});
app.get('/api/reviews', (_req, res) => res.json({ drafts: listArchivedDraftReviews() }));
app.post('/api/cubes', (req, res) => {
    try {
        res.json(saveCubeList(req.body?.name, req.body?.text));
    } catch (err) {
        const status = err instanceof CubeError ? 400 : 500;
        res.status(status).json({ message: err instanceof Error ? err.message : 'Could not save cube list.' });
    }
});

const clientDist = path.resolve(import.meta.dirname, '../../client/dist');
if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.use((_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });
const alive = new WeakSet<WebSocket>();

wss.on('connection', (ws) => {
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
    ws.on('close', () => detach(ws));
    ws.on('error', () => ws.terminate());
    ws.on('message', async (data) => {
        let msg: ClientMsg;
        try {
            msg = JSON.parse(data.toString());
        } catch {
            return;
        }
        try {
            await handle(ws, msg);
        } catch (err) {
            if (err instanceof GameError || err instanceof CubeError) send(ws, { t: 'error', message: err.message });
            else {
                console.error(err);
                send(ws, { t: 'error', message: 'The server could not process that action. Reload the page and try again.' });
            }
        }
    });
});

setInterval(() => {
    for (const ws of wss.clients) {
        if (!alive.has(ws)) {
            ws.terminate();
            continue;
        }
        alive.delete(ws);
        ws.ping();
    }
    const cutoff = Date.now() - TABLE_TTL_MS;
    for (const [id, table] of tables) {
        if (table.lastActive < cutoff) {
            for (const playerId of draftTimers.get(table)?.keys() ?? []) clearPickTimer(table, playerId);
            tables.delete(id);
        }
    }
}, 30_000);

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
