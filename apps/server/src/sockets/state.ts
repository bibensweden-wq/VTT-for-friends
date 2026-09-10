import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, Player, PublicGameState, ServerToClientEvents } from '@vtt/shared';
import { VttDatabase, type SessionPlayer } from '../database/db.js';
import { visibleTokensFor } from '../lib/permissions.js';

export interface SocketData { player: SessionPlayer; roomId: string }
export type VttServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type VttSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function connectedPlayerIds(io: VttServer, roomId: string): Set<string> {
  const ids = new Set<string>();
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return ids;
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.data.player) ids.add(socket.data.player.id);
  }
  return ids;
}

export function buildState(db: VttDatabase, io: VttServer, player: Player): PublicGameState {
  const room = db.roomById(player.roomId);
  if (!room) throw new Error('Room not found');
  const scene = db.scene(player.roomId);
  const connectedIds = connectedPlayerIds(io, player.roomId);
  const players = db.players(player.roomId).map((entry) => ({ ...entry, connected: connectedIds.has(entry.id) }));
  const self = players.find((entry) => entry.id === player.id) ?? { ...player, connected: true };
  const tokens = visibleTokensFor(player, db.tokens(scene.id));
  const storedCombat = db.combat(player.roomId);
  const visibleTokenIds = new Set(tokens.map((token) => token.id));
  const currentTokenId = storedCombat.combatants[storedCombat.turnIndex]?.tokenId;
  const combatants = player.role === 'gm' ? storedCombat.combatants : storedCombat.combatants.filter((entry) => visibleTokenIds.has(entry.tokenId));
  const visibleCurrentIndex = currentTokenId ? combatants.findIndex((entry) => entry.tokenId === currentTokenId) : -1;
  const combat = { ...storedCombat, active: storedCombat.active && combatants.length > 0, turnIndex: visibleCurrentIndex >= 0 ? visibleCurrentIndex : 0, combatants };
  return { room, self, players, scene, tokens, combat, chat: db.chat(player.roomId) };
}

export function emitRoomState(db: VttDatabase, io: VttServer, roomId: string) {
  const room = io.sockets.adapter.rooms.get(roomId);
  if (!room) return;
  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket?.data.player) continue;
    socket.emit('room:state', buildState(db, io, socket.data.player));
  }
}
