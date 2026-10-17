import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { CubeError, loadCube } from './cube';
import { GameError, Table, cleanName, makeTableCode } from './table';

const PORT = Number(process.env.PORT ?? 3001);
const MAX_TABLES = 200;
const TABLE_TTL_MS = 12 * 60 * 60 * 1000;

const tables = new Map<string, Table>();
const conns = new WeakMap<WebSocket, { tableId: string; playerId: string }>();
const creating = new WeakSet<WebSocket>();

const send = (ws: WebSocket, msg: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};

function broadcast(table: Table) {
    for (const p of table.players) if (p.ws) send(p.ws, { t: 'state', state: table.view(p.id) });
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
    if (table.abandoned && table.phase !== 'done') tables.delete(table.id);
}

async function handle(ws: WebSocket, msg: ClientMsg) {
    switch (msg.t) {
        case 'create': {
            if (creating.has(ws)) return;
            if (tables.size >= MAX_TABLES) throw new GameError('The server is busy. Try again later.');
            const name = cleanName(msg.name);
            creating.add(ws);
            try {
                const cube = await loadCube(msg.cube ?? {});
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
            if (!table) return send(ws, { t: 'error', message: 'No draft with that table code.' });
            table.touch();
            send(ws, { t: 'review', review: table.reviewView() });
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
            table.setSettings(conn.playerId, msg.packsPerPlayer, msg.cardsPerPack, msg.botStrategy);
            break;
        case 'start':
            table.start(conn.playerId);
            break;
        case 'pick':
            table.pick(conn.playerId, msg.cardId);
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
app.get('/api/health', (_req, res) => res.json({ ok: true, tables: tables.size }));

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
            else console.error(err);
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
    for (const [id, table] of tables) if (table.lastActive < cutoff) tables.delete(id);
}, 30_000);

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
