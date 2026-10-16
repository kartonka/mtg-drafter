# MTG Cube Drafter

Cube drafts with friends in the browser. Node (Express + WebSocket) server, React client. Card data and images come from Scryfall.

## Run locally

```
npm install
npm run dev      # client on http://localhost:5173, server on :3001
```

## Host on your LAN

```
npm install
npm run build
npm start
```

The server listens on all network interfaces, port 3001 (set `PORT` to change it). Others open `http://<your-LAN-IP>:3001`; find the IP with `ipconfig` (use the adapter on the network you share, e.g. Wi-Fi). Open that same address yourself too, rather than `localhost`, so "Copy invite link" produces a link others can use.

If friends cannot connect, allow Node.js through Windows Firewall for private networks, or run in an admin PowerShell:

```
New-NetFirewallRule -DisplayName "MTG Drafter" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

## Production / free hosting

```
npm install --include=dev
npm run build    # builds client/dist
npm start        # serves client + WebSocket on $PORT (default 3001)
```

Any free Node host works (e.g. Render free web service: build `npm install --include=dev && npm run build`, start `npm start`). State is held in memory, so a restart or free-tier sleep ends running drafts.

## Moxfield

The server fetches the list from Moxfield's unofficial API. Moxfield sits behind Cloudflare and may reject server requests (HTTP 403). If so, use "Paste a card list instead" (Moxfield: Export, copy as text). Set `MOXFIELD_USER_AGENT` if Moxfield issues you an API user agent.
