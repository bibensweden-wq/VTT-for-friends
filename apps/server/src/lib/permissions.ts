import type { Player, Token } from '@vtt/shared';

export const isGm = (player: Player) => player.role === 'gm';
export const canMoveToken = (player: Player, token: Token) => isGm(player) || token.ownerId === player.id;
export const visibleTokensFor = (player: Player, tokens: Token[]) => isGm(player) ? tokens : tokens.filter((token) => !token.hidden);
