import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@vtt/shared';

export type VttSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export interface Session { roomId:string; sessionToken:string; playerId:string }
const STORAGE_KEY='vtt-for-friends-session';
export function loadSession():Session|null{try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;const parsed=JSON.parse(raw) as Session;return parsed.roomId&&parsed.sessionToken&&parsed.playerId?parsed:null;}catch{return null;}}
export const saveSession=(session:Session)=>localStorage.setItem(STORAGE_KEY,JSON.stringify(session));
export const clearSession=()=>localStorage.removeItem(STORAGE_KEY);
export const connectSocket=(session:Session):VttSocket=>io({auth:{roomId:session.roomId,sessionToken:session.sessionToken},transports:['websocket','polling'],reconnection:true});
