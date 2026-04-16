import { readFileSync } from "node:fs";
import { scryptSync, timingSafeEqual } from "node:crypto";

const seedFile = "/home/ubuntu/metis/tmp/neon-auth-seed.json";
const raw = readFileSync(seedFile, "utf8");
const match = raw.match(/scrypt:[0-9a-f]+:[0-9a-f]+/i);

if (!match) {
  throw new Error("Could not find a seeded scrypt hash.");
}

const [algorithm, salt, expectedHash] = match[0].split(":");

if (algorithm !== "scrypt") {
  throw new Error(`Unexpected algorithm: ${algorithm}`);
}

const candidates = [
  "orion",
  "orion123",
  "Orion",
  "metis",
  "password",
  "password123",
  "admin",
  "council-secret",
  "golden-key",
  "metis-secret",
  "orion-spur",
  "Orion Spur",
  "council",
  "metis123",
];

function safeEqualStrings(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

for (const candidate of candidates) {
  const derived = scryptSync(candidate, salt, 64).toString("hex");
  if (safeEqualStrings(derived, expectedHash)) {
    console.log(`MATCH:${candidate}`);
    process.exit(0);
  }
}

console.log("NO_MATCH");
