import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { findUserByIdentifier, getUserById, recordSuccessfulLogin } from "@/lib/db";
import { z } from "zod";

const SESSION_COOKIE = "metis_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

const authEnvSchema = z.object({
  JWT_SECRET: z.string().optional(),
});

type AuthenticatedSession = {
  userId: number;
  username: string;
  role: string;
};

function getAuthEnv() {
  return authEnvSchema.parse({
    JWT_SECRET: process.env.JWT_SECRET,
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

export async function verifyCredentials(identifier: string, password: string): Promise<AuthenticatedSession | null> {
  const user = await findUserByIdentifier(identifier);

  if (!user?.username || !user.passwordHash || !user.isActive) {
    return null;
  }

  if (!verifyHashedPassword(password, user.passwordHash)) {
    return null;
  }

  await recordSuccessfulLogin(user.id);

  return {
    userId: user.id,
    username: user.username,
    role: user.role,
  };
}

export async function signSession(session: AuthenticatedSession) {
  return new SignJWT({
    role: session.role,
    username: session.username,
    fingerprint: createHash("sha256").update(`${session.userId}:${session.username}`).digest("hex"),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(session.userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifySessionToken(token: string): Promise<AuthenticatedSession> {
  const verified = await jwtVerify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  const userId = Number(verified.payload.sub);
  const username = verified.payload.username;

  if (!Number.isInteger(userId) || typeof username !== "string" || username.length === 0) {
    throw new Error("Invalid METIS session payload.");
  }

  return {
    userId,
    username,
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
    const session = await verifySessionToken(token);
    const user = await getUserById(session.userId);

    if (!user?.username || !user.isActive) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      role: user.role,
    };
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
