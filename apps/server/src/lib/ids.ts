import crypto from 'node:crypto';

export const id = () => crypto.randomUUID();
export const sessionToken = () => crypto.randomBytes(32).toString('base64url');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function joinCode(length = 6) {
  let result = '';
  for (let i = 0; i < length; i += 1) result += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  return result;
}
