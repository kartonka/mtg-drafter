# MTG Cube Drafter

Cube drafts with friends in the browser. Node (Express + WebSocket) server, React client. Card data and images come from Scryfall.

## Run locally

```
npm install
npm run dev      # client on http://localhost:5173, server on :3001
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
