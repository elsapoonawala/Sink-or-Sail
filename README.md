# The Last Ferry

Saltmere is sinking. One grand old ferry waits at the harbour. Fill its hold with fuel, medicine and tools, and sail before the tide takes the island. Carry off whatever treasure you can fit.

A live multiplayer browser game for 2 to 8 players. One person starts a room, everyone else joins with the 4-letter code or the link, from any phone or laptop. No accounts, no installs. A game takes about 20 minutes (or 12 in quick mode).

![The Last Ferry](client/public/cover.png)

## How to play

- **Goal:** load the ferry with the supplies shown on its brass gauges, then sail together.
- **Each tide** has three timed steps, and everyone acts at once:
  1. **Search:** tap a place on the island and draw cards there. One place floods every tide, and flooded places give fewer cards.
  2. **Trade:** offer cards and pearls to anyone. Pearls sweeten a deal.
  3. **Load:** put up to 2 cards into the hold. Crates stay sealed until the tide ends.
- **Sailing:** tap *Ready to leave*. When more than half the table is ready, the ferry sails. After the last tide it sails no matter what.
- **Treasure:** diamonds are worth 3 and pearls 1 to whoever brings them aboard, but a diamond takes 2 slots that fuel could have used. The richest Islander is crowned Grand Fortune.
- **Secret Wrecker:** with 5 or more players (or switched on in the lobby), a hidden player slips spoiled crates aboard and wins if the ferry sails short.

There are six roles, each with one power: Pearl Diver, Engineer, Physician, Cartographer, Jeweler and Duchess.

The table talks through built-in voice chat (with mute, speaking rings and per-player volume), one-tap signals such as "Need fuel" and "Ready to leave", and text chat. Playing alone? Add practice bots in the lobby.

## Running it

```bash
npm install
npm run dev      # game server on :3000, client with hot reload on :5173
npm test         # rules engine tests
npm run build && npm start   # production build served from :3000
```

## How it's built

- `shared/game.ts` is the rules engine. The server holds the only real game state and sends each player a view with hidden information removed.
- `shared/bots.ts` contains the practice bots.
- `server/` is a Node server (Express and Socket.IO) that runs rooms, phase timers and voice signalling.
- `client/` is a React app. All illustrations are hand-written SVG.
- Voice chat is peer-to-peer WebRTC audio. Public STUN works for most networks. For strict networks, set `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` to add a TURN relay.

## Deploying

The repo includes a `render.yaml`. On [Render](https://render.com), choose **New → Blueprint**, pick this repository, and deploy. Any host that runs a long-lived Node process with WebSockets works: build with `npm run build`, start with `npm start`, and the app listens on `$PORT`.
