import { describe,expect,it } from 'vitest';
import { nextTurn,previousTurn } from '../combat.js';
import type { Combat } from '@vtt/shared';
const base=():Combat=>({active:true,round:1,turnIndex:0,combatants:[{tokenId:'a',initiative:20},{tokenId:'b',initiative:10}]});
describe('combat navigation',()=>{it('advances round',()=>{expect(nextTurn(base())).toMatchObject({round:1,turnIndex:1});expect(nextTurn({...base(),turnIndex:1})).toMatchObject({round:2,turnIndex:0});});it('moves backward safely',()=>{expect(previousTurn({...base(),round:2,turnIndex:0})).toMatchObject({round:1,turnIndex:1});expect(previousTurn(base())).toMatchObject({round:1,turnIndex:0});});});
