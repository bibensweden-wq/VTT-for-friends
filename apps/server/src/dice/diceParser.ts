import crypto from 'node:crypto';
import type { DiceRoll } from '@vtt/shared';

export class DiceParseError extends Error {}

export function parseDiceExpression(raw: string): { count: number; sides: number; modifier: number; expression: string } {
  const expression = raw.trim().toLowerCase();
  const match = /^(\d*)d(\d+)(?:([+-])(\d+))?$/.exec(expression);
  if (!match) throw new DiceParseError('Use dice notation like d20, 2d6+3, or 1d20-1.');
  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  const absoluteModifier = match[4] ? Number(match[4]) : 0;
  const modifier = match[3] === '-' ? -absoluteModifier : absoluteModifier;
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new DiceParseError('Dice count must be between 1 and 100.');
  if (!Number.isSafeInteger(sides) || sides < 2 || sides > 1000) throw new DiceParseError('Die size must be between d2 and d1000.');
  if (!Number.isSafeInteger(modifier) || Math.abs(modifier) > 100000) throw new DiceParseError('Modifier is too large.');
  return { count, sides, modifier, expression };
}

export function rollDice(raw: string): DiceRoll {
  const parsed = parseDiceExpression(raw);
  const rolls = Array.from({ length: parsed.count }, () => crypto.randomInt(1, parsed.sides + 1));
  return { expression: parsed.expression, rolls, modifier: parsed.modifier, total: rolls.reduce((sum, roll) => sum + roll, 0) + parsed.modifier };
}
