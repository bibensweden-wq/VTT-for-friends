# VTT for Friends — v0.1.0

A small, local-network virtual tabletop for running a simple D&D combat with friends. The v0.1 goal is reliability and a playable multiplayer loop, not feature parity with Foundry.

## What v0.1 includes

- GM creates a room with a short join code.
- Players join from another browser or device on the same LAN/Wi-Fi.
- One scene with PNG/JPEG/WebP map upload.
- PixiJS map canvas with cursor-centered zoom and pan.
- Configurable square grid, offsets, visibility, and snap-to-grid.
- Tokens with image/fallback marker, name, HP, max HP, AC, grid size, owner, and GM-only hidden state.
- GM controls all tokens; players can move only tokens assigned to them.
- Hidden tokens are filtered on the server and are never sent in player game state.
- Combat tracker with manual initiative, rounds, previous/next turn, and current-token highlight.
- Shared chat and server-side dice rolls (`d20`, `2d6+3`, `1d20-1`, etc.).
- SQLite persistence for rooms, players, scenes, tokens, combat state, and chat.
- Reconnect state synchronization.

Not in v0.1: character sheets, D&D rules automation, fog of war, walls, lighting/vision, rulers/templates, inventory/spells, compendia, multiple scenes, macros, plugins, or AI.

## Prerequisites

Install **Node.js 22 or newer**. Node includes npm.

Check in Terminal / PowerShell:

```bash
node --version
npm --version
```

## Installation

Clone or download this repository, then open a terminal in the repository root (the directory containing this README and the root `package.json`).

```bash
npm install
```

You only run `npm install` at the repository root. npm workspaces install the client, server, and shared package together.

## Development

```bash
npm run dev
```

This builds the shared types first, then starts:

- server: `http://localhost:3000`
- Vite development client: `http://localhost:5173`

For normal development, open **http://localhost:5173**. Vite proxies API, uploads, and Socket.IO to the server.

## Production-style local run

Build once:

```bash
npm run build
```

Then start:

```bash
npm run start
```

Open:

```text
http://localhost:3000
```

In production mode the Express server serves the built React client, uploads, API, and Socket.IO from the same port.

## First GM test

1. Start the app.
2. Open the correct URL above.
3. Choose **Create Room**.
4. Enter a room name and GM name.
5. The top bar shows the room code.
6. Use **Copy code** and give it to a player.
7. As GM, upload a map in the Scene panel.
8. Create tokens in the left sidebar and assign one to the connected player.

The GM session token is stored in that browser's local storage. There are no user accounts in v0.1.

## Test a player on the same computer

Use a private/incognito browser window (or a different browser) so it has separate local storage.

1. Open the VTT URL.
2. Choose **Join Room**.
3. Enter the room code and a player name.
4. Once joined, the GM can assign that player a token.
5. Confirm the player can drag their token but not other tokens.

## Connect from another computer/tablet on the same Wi-Fi/LAN

The server listens on `0.0.0.0`. At startup it prints discovered LAN addresses, for example:

```text
Local:   http://localhost:3000
Network: http://192.168.1.37:3000
```

After `npm run build && npm run start`, another device on the same network opens the **Network** URL, for example:

```text
http://192.168.1.37:3000
```

For development, Vite also listens on the network. A second device can use port 5173, for example `http://192.168.1.37:5173`.

### Find the LAN IP manually

**Windows (PowerShell / Command Prompt):** `ipconfig` and look for `IPv4 Address` on the active Wi-Fi/Ethernet adapter.

**macOS:** `ipconfig getifaddr en0` (or use `ifconfig` if the interface differs).

**Linux:** `hostname -I`.

Use the private-network address, commonly beginning with `192.168.` or `10.`.

### Firewall

If Windows asks whether Node.js may communicate through the firewall, allow it on **Private networks**. If another device cannot connect, confirm both devices are on the same LAN/Wi-Fi and that local firewall software permits inbound TCP traffic on port 3000 (production) or 5173 (development).

## Canvas controls

- **Mouse wheel** — zoom toward/away from the cursor.
- **Middle mouse drag** — pan the map.
- **Space + left drag** — pan the map.
- **Left drag controlled token** — move token.
- **Left click token** — select it.
- With snap enabled, the server snaps the final token position to the configured square grid.

## Map and token images

Supported image types: PNG, JPEG, WebP. Maximum upload size: 20 MB per image. Files are renamed with server-generated IDs; original filenames are not trusted.

## Dice

Supported examples: `d20`, `1d20+5`, `1d20-3`, `2d6+4`, `4d8`, `d100`.

Rolls happen on the server. The server rejects more than 100 dice, dice larger than d1000, and unreasonable modifiers. `eval` is never used.

## Data locations

SQLite database: `data/vtt.sqlite`

Uploaded maps: `uploads/maps/`

Uploaded token images: `uploads/tokens/`

These runtime files are ignored by Git.

## Back up a campaign

With the server stopped, copy `data/` and `uploads/`.

## Reset development data

Stop the server first. Delete `data/vtt.sqlite`, uploaded map files, and uploaded token files. The next server start recreates the database schema automatically.

## Tests

```bash
npm run test
```

The v0.1 tests cover dice parsing, ownership/permissions, hidden-token filtering, and combat turn navigation.

## Useful commands

```bash
npm install
npm run dev
npm run build
npm run test
npm run start
```

## Known v0.1 limitations

- One scene per room.
- No authentication beyond random room session tokens stored in the browser.
- Joining the same room repeatedly creates separate player entries.
- Initiative entry is manual.
- No collision, pathfinding, fog, walls, vision, lighting, ruler, or AoE templates.
- Upload cleanup is manual; replacing an image does not delete the old file.
- Desktop-first UI.
- LAN-oriented; exposing this directly to the public internet is outside the v0.1 security model.

## Project structure

```text
apps/client       React + Vite + PixiJS UI
apps/server       Express + Socket.IO + SQLite authoritative server
packages/shared   shared TypeScript/Zod domain model and socket contracts
data              SQLite runtime data
uploads           runtime map/token images
```

The server is authoritative: clients request changes, the server validates permissions and data, persists accepted state, then sends personalized state back to each connected client.
