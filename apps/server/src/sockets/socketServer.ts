import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { chatSendSchema, combatStartSchema, diceRollRequestSchema, sceneUpdateSchema, tokenCreateSchema, tokenMoveSchema, tokenUpdateSchema, type ChatMessage, type Combat, type Token } from '@vtt/shared';
import { VttDatabase } from '../database/db.js';
import { rollDice } from '../dice/diceParser.js';
import { id } from '../lib/ids.js';
import { nextTurn, previousTurn } from '../lib/combat.js';
import { canMoveToken, isGm } from '../lib/permissions.js';
import { buildState, emitRoomState, type VttServer } from './state.js';

const message = (error: unknown) => error instanceof Error ? error.message : 'Unexpected server error';

export function createSocketServer(httpServer: HttpServer, db: VttDatabase): VttServer {
  const io: VttServer = new Server(httpServer, { cors: { origin: true, credentials: false } });

  io.use((socket, next) => {
    const roomId = typeof socket.handshake.auth.roomId === 'string' ? socket.handshake.auth.roomId : '';
    const token = typeof socket.handshake.auth.sessionToken === 'string' ? socket.handshake.auth.sessionToken : '';
    const player = roomId && token ? db.playerBySession(roomId, token) : null;
    if (!player) return next(new Error('Invalid or expired room session.'));
    socket.data.player = player;
    socket.data.roomId = roomId;
    next();
  });

  io.on('connection', (socket) => {
    const { player, roomId } = socket.data;
    socket.join(roomId);
    socket.emit('connection:status', 'connected');
    socket.emit('room:state', buildState(db, io, player));
    emitRoomState(db, io, roomId);

    socket.on('room:requestState', (ack) => {
      try { const state = buildState(db, io, player); socket.emit('room:state', state); ack?.({ ok: true, data: state }); }
      catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('scene:update', (payload, ack) => {
      try { if (!isGm(player)) throw new Error('Only the GM can change scene settings.'); const scene = db.updateScene(roomId, sceneUpdateSchema.parse(payload)); emitRoomState(db, io, roomId); ack?.({ ok: true, data: scene }); }
      catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('token:create', (payload, ack) => {
      try {
        if (!isGm(player)) throw new Error('Only the GM can create tokens.');
        const data = tokenCreateSchema.parse(payload);
        if (data.ownerId && !db.players(roomId).some((entry) => entry.id === data.ownerId)) throw new Error('Token owner must be a player in this room.');
        const scene = db.scene(roomId);
        const token: Token = { id: id(), sceneId: scene.id, ...data };
        db.createToken(token); emitRoomState(db, io, roomId); ack?.({ ok: true, data: token });
      } catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('token:update', (payload, ack) => {
      try {
        if (!isGm(player)) throw new Error('Only the GM can edit tokens.');
        const token = db.token(payload.tokenId); if (!token || token.sceneId !== db.scene(roomId).id) throw new Error('Token not found.');
        const patch = tokenUpdateSchema.parse(payload.patch);
        if (patch.ownerId && !db.players(roomId).some((entry) => entry.id === patch.ownerId)) throw new Error('Token owner must be a player in this room.');
        const updated = db.updateToken(token.id, patch); emitRoomState(db, io, roomId); ack?.({ ok: true, data: updated });
      } catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('token:move', (payload, ack) => {
      try {
        const move = tokenMoveSchema.parse(payload);
        const token = db.token(move.tokenId); if (!token || token.sceneId !== db.scene(roomId).id) throw new Error('Token not found.');
        if (!canMoveToken(player, token)) throw new Error('You do not control this token.');
        const scene = db.scene(roomId); let { x, y } = move;
        if (scene.snapToGrid) { x = Math.round((x - scene.gridOffsetX) / scene.gridSize) * scene.gridSize + scene.gridOffsetX; y = Math.round((y - scene.gridOffsetY) / scene.gridSize) * scene.gridSize + scene.gridOffsetY; }
        const updated = db.updateToken(token.id, { x, y }); emitRoomState(db, io, roomId); ack?.({ ok: true, data: updated });
      } catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('token:delete', (payload, ack) => {
      try { if (!isGm(player)) throw new Error('Only the GM can delete tokens.'); const token = db.token(payload.tokenId); if (!token) throw new Error('Token not found.'); db.deleteToken(token.id); emitRoomState(db, io, roomId); ack?.({ ok: true }); }
      catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('combat:start', (payload, ack) => {
      try {
        if (!isGm(player)) throw new Error('Only the GM can start combat.');
        const parsed = combatStartSchema.parse(payload); const valid = new Set(db.tokens(db.scene(roomId).id).map((t) => t.id)); const seen = new Set<string>();
        const combatants = parsed.combatants.filter((c) => valid.has(c.tokenId) && !seen.has(c.tokenId) && Boolean(seen.add(c.tokenId))).sort((a,b) => b.initiative - a.initiative);
        if (!combatants.length) throw new Error('Add at least one valid token to combat.');
        const combat: Combat = { active: true, round: 1, turnIndex: 0, combatants }; db.saveCombat(roomId, combat); emitRoomState(db, io, roomId); ack?.({ ok: true, data: combat });
      } catch (error) { ack?.({ ok: false, error: message(error) }); }
    });

    socket.on('combat:end', (ack) => { try { if (!isGm(player)) throw new Error('Only the GM can end combat.'); const combat = db.saveCombat(roomId, { active:false, round:1, turnIndex:0, combatants:[] }); emitRoomState(db,io,roomId); ack?.({ok:true,data:combat}); } catch(error){ ack?.({ok:false,error:message(error)}); } });
    socket.on('combat:next', (ack) => { try { if (!isGm(player)) throw new Error('Only the GM can change turns.'); const combat=db.saveCombat(roomId,nextTurn(db.combat(roomId))); emitRoomState(db,io,roomId); ack?.({ok:true,data:combat}); } catch(error){ ack?.({ok:false,error:message(error)}); } });
    socket.on('combat:previous', (ack) => { try { if (!isGm(player)) throw new Error('Only the GM can change turns.'); const combat=db.saveCombat(roomId,previousTurn(db.combat(roomId))); emitRoomState(db,io,roomId); ack?.({ok:true,data:combat}); } catch(error){ ack?.({ok:false,error:message(error)}); } });

    socket.on('chat:send', (payload, ack) => {
      try { const parsed=chatSendSchema.parse(payload); const entry:ChatMessage={id:id(),roomId,playerId:player.id,playerName:player.name,type:player.role==='gm'?'gm':'player',content:parsed.content,createdAt:new Date().toISOString()}; db.addChat(entry); emitRoomState(db,io,roomId); ack?.({ok:true,data:entry}); }
      catch(error){ ack?.({ok:false,error:message(error)}); }
    });

    socket.on('dice:roll', (payload, ack) => {
      try { const parsed=diceRollRequestSchema.parse(payload); const result=rollDice(parsed.expression); const modifier=result.modifier===0?'':result.modifier>0?` + ${result.modifier}`:` - ${Math.abs(result.modifier)}`; db.addChat({id:id(),roomId,playerId:player.id,playerName:player.name,type:'roll',content:`${result.expression}: [${result.rolls.join(', ')}]${modifier} = ${result.total}`,createdAt:new Date().toISOString()}); emitRoomState(db,io,roomId); ack?.({ok:true,data:result}); }
      catch(error){ ack?.({ok:false,error:message(error)}); }
    });

    socket.on('disconnect', () => queueMicrotask(() => emitRoomState(db, io, roomId)));
  });
  return io;
}
