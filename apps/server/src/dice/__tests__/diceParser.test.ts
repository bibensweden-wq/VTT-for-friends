import { describe,expect,it } from 'vitest';
import { DiceParseError,parseDiceExpression,rollDice } from '../diceParser.js';

describe('dice parser',()=>{
  it('parses supported notation',()=>{expect(parseDiceExpression('d20')).toEqual({count:1,sides:20,modifier:0,expression:'d20'});expect(parseDiceExpression('2d6+3')).toEqual({count:2,sides:6,modifier:3,expression:'2d6+3'});expect(parseDiceExpression('1d20-4')).toEqual({count:1,sides:20,modifier:-4,expression:'1d20-4'});});
  it('rejects unsafe notation',()=>{for(const input of ['eval(1)','0d20','101d6','2d1001','1d1','2d6+100001'])expect(()=>parseDiceExpression(input)).toThrow(DiceParseError);});
  it('rolls in bounds',()=>{const r=rollDice('4d8+2');expect(r.rolls).toHaveLength(4);expect(r.rolls.every(v=>v>=1&&v<=8)).toBe(true);expect(r.total).toBe(r.rolls.reduce((s,v)=>s+v,0)+2);});
});
