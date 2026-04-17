import { SignJWT } from 'jose';
import { createHash } from 'node:crypto';

const userId = Number(process.argv[2] ?? 1);
const username = process.argv[3] ?? 'orion';
const role = process.argv[4] ?? 'admin';
const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 16) {
  throw new Error('JWT_SECRET is missing or too short.');
}

const token = await new SignJWT({
  role,
  username,
  fingerprint: createHash('sha256').update(`${userId}:${username}`).digest('hex'),
})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(String(userId))
  .setIssuedAt()
  .setExpirationTime('43200s')
  .sign(new TextEncoder().encode(secret));

console.log(`metis_session=${token}`);
