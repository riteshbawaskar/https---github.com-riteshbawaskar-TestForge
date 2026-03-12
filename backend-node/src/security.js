// XOR + base64 token encryption (same algorithm as Python backend)
import { config } from './config.js';

function keyBytes() {
  const secret = config.encryptionSecret;
  const repeated = secret.repeat(4).slice(0, 32);
  return Buffer.from(repeated, 'utf8');
}

export function encryptToken(plaintext) {
  if (!plaintext) return '';
  const data = Buffer.from(plaintext, 'utf8');
  const key  = keyBytes();
  const xored = Buffer.from(data.map((b, i) => b ^ key[i % key.length]));
  return xored.toString('base64url');
}

export function decryptToken(ciphertext) {
  if (!ciphertext) return '';
  const xored = Buffer.from(ciphertext, 'base64url');
  const key   = keyBytes();
  const data  = Buffer.from(xored.map((b, i) => b ^ key[i % key.length]));
  return data.toString('utf8');
}
