import { randomBytes } from 'crypto';

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(6).toString('hex')}`;
}
