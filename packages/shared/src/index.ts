import { z } from 'zod';

export const playerRoleSchema = z.enum(['gm', 'player']);
export type PlayerRole = z.infer<typeof playerRoleSchema>;

export const roomSchema = z.object({ id: z.string().min(1), name: z.string().min(1).max(80), joinCode: z.string().min(4).max(12), createdAt: z.string() });
export type Room = z.infer<typeof roomSchema>;

export const playerSchema = z.object({ id: z.string().min(1), roomId: z.string().min(1), name: z.string().min(1).max(40), role: playerRoleSchema, connected: z.boolean().default(false) });
export type Player = z.infer<typeof playerSchema>;

export const sceneSchema = z.object({ id: z.string().min(1), roomId: z.string().min(1), name: z.string().min(1).max(80), mapUrl: z.string().nullable(), mapWidth: z.number().int().nonnegative(), mapHeight: z.number().int().nonnegative(), gridSize: z.number().int().min(10).max(500), gridOffsetX: z.number().int().min(-5000).max(5000), gridOffsetY: z.number().int().min(-5000).max(5000), gridVisible: z.boolean(), snapToGrid: z.boolean() });
export type Scene = z.infer<typeof sceneSchema>;

export const tokenSchema = z.object({ id: z.string().min(1), sceneId: z.string().min(1), name: z.string().min(1).max(80), x: z.number().finite(), y: z.number().finite(), width: z.number().int().min(1).max(10), height: z.number().int().min(1).max(10), imageUrl: z.string().nullable(), hp: z.number().int().min(-9999).max(999999), maxHp: z.number().int().min(1).max(999999), ac: z.number().int().min(0).max(100), ownerId: z.string().nullable(), hidden: z.boolean() });
export type Token = z.infer<typeof tokenSchema>;

export const combatantSchema = z.object({ tokenId: z.string().min(1), initiative: z.number().finite() });
export type Combatant = z.infer<typeof combatantSchema>;

export const combatSchema = z.object({ active: z.boolean(), round: z.number().int().min(1), turnIndex: z.number().int().min(0), combatants: z.array(combatantSchema) });
export type Combat = z.infer<typeof combatSchema>;

export const chatMessageTypeSchema = z.enum(['player', 'gm', 'system', 'roll']);
export type ChatMessageType = z.infer<typeof chatMessageTypeSchema>;

export const chatMessageSchema = z.object({ id: z.string().min(1), roomId: z.string().min(1), playerId: z.string().nullable(), playerName: z.string().min(1).max(40), type: chatMessageTypeSchema, content: z.string().min(1).max(2000), createdAt: z.string() });
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const diceExpressionSchema = z.string().trim().regex(/^\d*[dD]\d+(?:[+-]\d+)?$/, 'Use dice notation like d20, 2d6+3, or 1d20-1');
export const diceRollSchema = z.object({ expression: z.string(), rolls: z.array(z.number().int()), modifier: z.number().int(), total: z.number().int() });
export type DiceRoll = z.infer<typeof diceRollSchema>;

export const publicGameStateSchema = z.object({ room: roomSchema, self: playerSchema, players: z.array(playerSchema), scene: sceneSchema, tokens: z.array(tokenSchema), combat: combatSchema, chat: z.array(chatMessageSchema) });
export type PublicGameState = z.infer<typeof publicGameStateSchema>;

export const createRoomRequestSchema = z.object({ roomName: z.string().trim().min(1).max(80).default('My VTT Room'), gmName: z.string().trim().min(1).max(40).default('GM') });
export const joinRoomRequestSchema = z.object({ joinCode: z.string().trim().min(4).max(12).transform((value) => value.toUpperCase()), playerName: z.string().trim().min(1).max(40) });
export const sceneUpdateSchema = sceneSchema.pick({ gridSize: true, gridOffsetX: true, gridOffsetY: true, gridVisible: true, snapToGrid: true }).partial();
export const tokenCreateSchema = tokenSchema.omit({ id: true, sceneId: true }).extend({ name: z.string().trim().min(1).max(80) });
export const tokenUpdateSchema = tokenCreateSchema.partial();
export const tokenMoveSchema = z.object({ tokenId: z.string().min(1), x: z.number().finite(), y: z.number().finite() });
export const chatSendSchema = z.object({ content: z.string().trim().min(1).max(2000) });
export const diceRollRequestSchema = z.object({ expression: diceExpressionSchema });
export const combatStartSchema = z.object({ combatants: z.array(combatantSchema).min(1) });
export const combatSetInitiativeSchema = z.object({ tokenId: z.string().min(1), initiative: z.number().finite() });

export type Ack<T = undefined> = T extends undefined ? { ok: true } | { ok: false; error: string } : { ok: true; data: T } | { ok: false; error: string };

export interface ClientToServerEvents {
  'room:requestState': (ack?: (result: Ack<PublicGameState>) => void) => void;
  'token:create': (payload: z.infer<typeof tokenCreateSchema>, ack?: (result: Ack<Token>) => void) => void;
  'token:update': (payload: { tokenId: string; patch: z.infer<typeof tokenUpdateSchema> }, ack?: (result: Ack<Token>) => void) => void;
  'token:move': (payload: z.infer<typeof tokenMoveSchema>, ack?: (result: Ack<Token>) => void) => void;
  'token:delete': (payload: { tokenId: string }, ack?: (result: Ack) => void) => void;
  'scene:update': (payload: z.infer<typeof sceneUpdateSchema>, ack?: (result: Ack<Scene>) => void) => void;
  'combat:start': (payload: z.infer<typeof combatStartSchema>, ack?: (result: Ack<Combat>) => void) => void;
  'combat:end': (ack?: (result: Ack<Combat>) => void) => void;
  'combat:next': (ack?: (result: Ack<Combat>) => void) => void;
  'combat:previous': (ack?: (result: Ack<Combat>) => void) => void;
  'combat:setInitiative': (payload: z.infer<typeof combatSetInitiativeSchema>, ack?: (result: Ack<Combat>) => void) => void;
  'chat:send': (payload: z.infer<typeof chatSendSchema>, ack?: (result: Ack<ChatMessage>) => void) => void;
  'dice:roll': (payload: z.infer<typeof diceRollRequestSchema>, ack?: (result: Ack<DiceRoll>) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: PublicGameState) => void;
  'room:error': (message: string) => void;
  'player:joined': (player: Player) => void;
  'player:left': (playerId: string) => void;
  'connection:status': (status: 'connected' | 'disconnected') => void;
}
