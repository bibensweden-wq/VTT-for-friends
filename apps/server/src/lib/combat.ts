import type { Combat } from '@vtt/shared';

export function nextTurn(combat: Combat): Combat {
  if (!combat.active || combat.combatants.length === 0) return combat;
  const next = combat.turnIndex + 1;
  if (next >= combat.combatants.length) return { ...combat, turnIndex: 0, round: combat.round + 1 };
  return { ...combat, turnIndex: next };
}

export function previousTurn(combat: Combat): Combat {
  if (!combat.active || combat.combatants.length === 0) return combat;
  if (combat.turnIndex > 0) return { ...combat, turnIndex: combat.turnIndex - 1 };
  if (combat.round > 1) return { ...combat, round: combat.round - 1, turnIndex: combat.combatants.length - 1 };
  return { ...combat, turnIndex: 0, round: 1 };
}
