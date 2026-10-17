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

The server can fetch a cube from Moxfield's unofficial API, but Moxfield may reject requests (HTTP 403). If loading fails, use Moxfield's Export command, then paste and save the list in the app. Set `MOXFIELD_USER_AGENT` if Moxfield issues you an API user agent.

## Saved cube lists

Paste a list, give it a name, and save it to the server's `server/data/cubes.json` file. Saving another list with the same name replaces it. The existing `default_cubes/imbur.txt` and `marci-cube.txt` files are available in the saved-list selector as `imbur` and `marci-cube`; the selector shows each list's last edit date.

Completed draft logs are archived in `server/data/draft-reviews` and appear in the past-draft selector with their table code and exact UTC start timestamp. Both saved lists and archived reviews survive server restarts when the host preserves the server filesystem.

## Draft reviews

After a draft is complete, open **Review draft** or share `http://<host>:3001/#review-<TABLECODE>` to review picks for any player. Completed drafts remain available by table code for up to 12 hours after activity; drafts are still held in memory and are lost if the server restarts.
