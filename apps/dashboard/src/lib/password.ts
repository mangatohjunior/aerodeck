import { randomBytes, scryptSync } from "node:crypto";

const KEY_LEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}
