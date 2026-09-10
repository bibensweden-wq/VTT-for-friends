import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { ChatMessage, Combat, Player, PlayerRole, Room, Scene, Token } from '@vtt/shared';
import { DATA_DIR } from '../lib/paths.js';

export interface SessionPlayer extends Player { sessionToken: string }

export class VttDatabase {
  readonly db: Database.Database;
  constructor(filename = path.join(DATA_DIR, 'vtt.sqlite')) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }
  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, join_code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('gm','player')), session_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, room_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, map_url TEXT, map_width INTEGER NOT NULL DEFAULT 0, map_height INTEGER NOT NULL DEFAULT 0, grid_size INTEGER NOT NULL DEFAULT 70, grid_offset_x INTEGER NOT NULL DEFAULT 0, grid_offset_y INTEGER NOT NULL DEFAULT 0, grid_visible INTEGER NOT NULL DEFAULT 1, snap_to_grid INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, scene_id TEXT NOT NULL, name TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, image_url TEXT, hp INTEGER NOT NULL, max_hp INTEGER NOT NULL, ac INTEGER NOT NULL, owner_id TEXT, hidden INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE, FOREIGN KEY(owner_id) REFERENCES players(id) ON DELETE SET NULL);
      CREATE TABLE IF NOT EXISTS combats (room_id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 0, round INTEGER NOT NULL DEFAULT 1, turn_index INTEGER NOT NULL DEFAULT 0, combatants_json TEXT NOT NULL DEFAULT '[]', FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, player_id TEXT, player_name TEXT NOT NULL, type TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
      CREATE INDEX IF NOT EXISTS idx_tokens_scene ON tokens(scene_id);
      CREATE INDEX IF NOT EXISTS idx_chat_room_created ON chat_messages(room_id, created_at);
    `);
  }
  close() { this.db.close(); }
  createRoom(input: { id:string; name:string; joinCode:string; createdAt:string; gmId:string; gmName:string; gmToken:string; sceneId:string }) {
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO rooms (id,name,join_code,created_at) VALUES (?,?,?,?)').run(input.id,input.name,input.joinCode,input.createdAt);
      this.db.prepare("INSERT INTO players (id,room_id,name,role,session_token,created_at) VALUES (?,?,?,'gm',?,?)").run(input.gmId,input.id,input.gmName,input.gmToken,input.createdAt);
      this.db.prepare("INSERT INTO scenes (id,room_id,name,map_url,map_width,map_height,grid_size,grid_offset_x,grid_offset_y,grid_visible,snap_to_grid) VALUES (?,?,'Main Scene',NULL,0,0,70,0,0,1,1)").run(input.sceneId,input.id);
      this.db.prepare("INSERT INTO combats (room_id,active,round,turn_index,combatants_json) VALUES (?,0,1,0,'[]')").run(input.id);
    })();
  }
  roomByCode(code:string): Room|null { const r=this.db.prepare('SELECT * FROM rooms WHERE join_code=?').get(code) as any; return r?this.mapRoom(r):null; }
  roomById(id:string): Room|null { const r=this.db.prepare('SELECT * FROM rooms WHERE id=?').get(id) as any; return r?this.mapRoom(r):null; }
  joinCodeExists(code:string) { return Boolean(this.db.prepare('SELECT 1 FROM rooms WHERE join_code=?').get(code)); }
  createPlayer(i:{id:string;roomId:string;name:string;sessionToken:string;createdAt:string}) { this.db.prepare("INSERT INTO players (id,room_id,name,role,session_token,created_at) VALUES (?,?,?,'player',?,?)").run(i.id,i.roomId,i.name,i.sessionToken,i.createdAt); }
  playerBySession(roomId:string, token:string): SessionPlayer|null { const r=this.db.prepare('SELECT * FROM players WHERE room_id=? AND session_token=?').get(roomId,token) as any; return r?{...this.mapPlayer(r),sessionToken:r.session_token}:null; }
  players(roomId:string): Player[] { return (this.db.prepare('SELECT * FROM players WHERE room_id=? ORDER BY role,rowid').all(roomId) as any[]).map(r=>this.mapPlayer(r)); }
  scene(roomId:string): Scene { const r=this.db.prepare('SELECT * FROM scenes WHERE room_id=?').get(roomId) as any; if(!r) throw new Error('Scene not found'); return this.mapScene(r); }
  updateScene(roomId:string, patch:Partial<Scene>):Scene { const m:any={mapUrl:'map_url',mapWidth:'map_width',mapHeight:'map_height',gridSize:'grid_size',gridOffsetX:'grid_offset_x',gridOffsetY:'grid_offset_y',gridVisible:'grid_visible',snapToGrid:'snap_to_grid',name:'name'}; const e=Object.entries(patch).filter(([k,v])=>m[k]&&v!==undefined); if(e.length){this.db.prepare(`UPDATE scenes SET ${e.map(([k])=>`${m[k]}=?`).join(',')} WHERE room_id=?`).run(...e.map(([,v])=>typeof v==='boolean'?Number(v):v),roomId)} return this.scene(roomId); }
  tokens(sceneId:string):Token[]{ return (this.db.prepare('SELECT * FROM tokens WHERE scene_id=? ORDER BY rowid').all(sceneId) as any[]).map(r=>this.mapToken(r)); }
  token(id:string):Token|null{ const r=this.db.prepare('SELECT * FROM tokens WHERE id=?').get(id) as any; return r?this.mapToken(r):null; }
  createToken(t:Token){this.db.prepare('INSERT INTO tokens (id,scene_id,name,x,y,width,height,image_url,hp,max_hp,ac,owner_id,hidden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(t.id,t.sceneId,t.name,t.x,t.y,t.width,t.height,t.imageUrl,t.hp,t.maxHp,t.ac,t.ownerId,Number(t.hidden));return t;}
  updateToken(id:string,patch:Partial<Token>):Token{const m:any={name:'name',x:'x',y:'y',width:'width',height:'height',imageUrl:'image_url',hp:'hp',maxHp:'max_hp',ac:'ac',ownerId:'owner_id',hidden:'hidden'};const e=Object.entries(patch).filter(([k,v])=>m[k]&&v!==undefined);if(e.length)this.db.prepare(`UPDATE tokens SET ${e.map(([k])=>`${m[k]}=?`).join(',')} WHERE id=?`).run(...e.map(([,v])=>typeof v==='boolean'?Number(v):v),id);const t=this.token(id);if(!t)throw new Error('Token not found');return t;}
  deleteToken(id:string){this.db.prepare('DELETE FROM tokens WHERE id=?').run(id);}
  combat(roomId:string):Combat{const r=this.db.prepare('SELECT * FROM combats WHERE room_id=?').get(roomId) as any;return r?{active:Boolean(r.active),round:r.round,turnIndex:r.turn_index,combatants:JSON.parse(r.combatants_json)}:{active:false,round:1,turnIndex:0,combatants:[]};}
  saveCombat(roomId:string,c:Combat){this.db.prepare('INSERT INTO combats (room_id,active,round,turn_index,combatants_json) VALUES (?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET active=excluded.active,round=excluded.round,turn_index=excluded.turn_index,combatants_json=excluded.combatants_json').run(roomId,Number(c.active),c.round,c.turnIndex,JSON.stringify(c.combatants));return c;}
  chat(roomId:string,limit=100):ChatMessage[]{return (this.db.prepare('SELECT * FROM (SELECT * FROM chat_messages WHERE room_id=? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC').all(roomId,limit) as any[]).map(r=>this.mapChat(r));}
  addChat(m:ChatMessage){this.db.prepare('INSERT INTO chat_messages (id,room_id,player_id,player_name,type,content,created_at) VALUES (?,?,?,?,?,?,?)').run(m.id,m.roomId,m.playerId,m.playerName,m.type,m.content,m.createdAt);return m;}
  private mapRoom(r:any):Room{return{id:r.id,name:r.name,joinCode:r.join_code,createdAt:r.created_at}}
  private mapPlayer(r:any):Player{return{id:r.id,roomId:r.room_id,name:r.name,role:r.role as PlayerRole,connected:false}}
  private mapScene(r:any):Scene{return{id:r.id,roomId:r.room_id,name:r.name,mapUrl:r.map_url,mapWidth:r.map_width,mapHeight:r.map_height,gridSize:r.grid_size,gridOffsetX:r.grid_offset_x,gridOffsetY:r.grid_offset_y,gridVisible:Boolean(r.grid_visible),snapToGrid:Boolean(r.snap_to_grid)}}
  private mapToken(r:any):Token{return{id:r.id,sceneId:r.scene_id,name:r.name,x:r.x,y:r.y,width:r.width,height:r.height,imageUrl:r.image_url,hp:r.hp,maxHp:r.max_hp,ac:r.ac,ownerId:r.owner_id,hidden:Boolean(r.hidden)}}
  private mapChat(r:any):ChatMessage{return{id:r.id,roomId:r.room_id,playerId:r.player_id,playerName:r.player_name,type:r.type,content:r.content,createdAt:r.created_at}}
}
