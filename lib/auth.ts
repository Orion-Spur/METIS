import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const SESSION_COOKIE = "metis_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const authEnvSchema = z.object({
  JWT_SECRET: z.string().optional(),
  METIS_LOGIN_USERNAME: z.string().min(1).default("admin"),
  METIS_LOGIN_PASSWORD: z.string().optional(),
  METIS_LOGIN_PASSWORD_HASH: z.string().optional(),
});

function getAuthEnv() {
  return authEnvSchema.parse({
    JWT_SECRET: process.env.JWT_SECRET,
    METIS_LOGIN_USERNAME: process.env.METIS_LOGIN_USERNAME,
    METIS_LOGIN_PASSWORD: process.env.METIS_LOGIN_PASSWORD,
    METIS_LOGIN_PASSWORD_HASH: process.env.METIS_LOGIN_PASSWORD_HASH,
  });
}

function getJwtSecret() {
  const { JWT_SECRET } = getAuthEnv();

  if (!JWT_SECRET || JWT_SECRET.length < 16) {
    throw new Error("JWT_SECRET is not configured. Set JWT_SECRET in the deployment environment with at least 16 characters.");
  }

  return new TextEncoder().encode(JWT_SECRET);
}

function safeEqualStrings(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyHashedPassword(password: string, stored: string) {
  const [algorithm, salt, expectedHash] = stored.split(":");

  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64).toString("hex");
  return safeEqualStrings(derived, expectedHash);
}

export function createScryptHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyCredentials(username: string, password: string) {
  const authEnv = getAuthEnv();

  if (!safeEqualStrings(username, authEnv.METIS_LOGIN_USERNAME)) {
    return false;
  }

  if (authEnv.METIS_LOGIN_PASSWORD_HASH) {
    return verifyHashedPassword(password, authEnv.METIS_LOGIN_PASSWORD_HASH);
  }

  if (!authEnv.METIS_LOGIN_PASSWORD) {
    return false;
  }

  return safeEqualStrings(password, authEnv.METIS_LOGIN_PASSWORD);
}

export async function signSession(username: string) {
  return new SignJWT({ role: "admin", fingerprint: createHash("sha256").update(username).digest("hex") })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string) {
  const verified = await jwtVerify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  return {
    username: verified.payload.sub,
    role: String(verified.payload.role ?? "admin"),
  };
}

export async function getCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

export function getSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}
