import { describe,expect,it } from 'vitest';
import { canMoveToken,visibleTokensFor } from '../permissions.js';
import type { Player,Token } from '@vtt/shared';
const gm:Player={id:'gm',roomId:'r',name:'GM',role:'gm',connected:true};const p:Player={id:'p1',roomId:'r',name:'Mira',role:'player',connected:true};const other:Player={id:'p2',roomId:'r',name:'Rook',role:'player',connected:true};
const token=(id:string,ownerId:string|null,hidden=false):Token=>({id,sceneId:'s',name:id,x:0,y:0,width:1,height:1,imageUrl:null,hp:10,maxHp:10,ac:12,ownerId,hidden});
describe('permissions',()=>{it('enforces token ownership',()=>{expect(canMoveToken(gm,token('a',other.id))).toBe(true);expect(canMoveToken(p,token('a',p.id))).toBe(true);expect(canMoveToken(p,token('b',other.id))).toBe(false);});it('filters hidden tokens for players',()=>{const all=[token('visible',null),token('secret',p.id,true)];expect(visibleTokensFor(gm,all)).toHaveLength(2);expect(visibleTokensFor(p,all).map(t=>t.id)).toEqual(['visible']);});});
