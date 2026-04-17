import fs from 'node:fs/promises';
import postgres from 'postgres';

const filePath = process.argv[2];
if (!filePath) {
  throw new Error('Usage: node scripts/apply-sql-file.mjs <sql-file>');
}

const connectionString = process.env.METIS_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('No database connection string found.');
}

const sqlText = await fs.readFile(filePath, 'utf8');
const statements = sqlText
  .split('--> statement-breakpoint')
  .map((part) => part.trim())
  .filter(Boolean);

const client = postgres(connectionString, { max: 1, prepare: false });

try {
  for (const statement of statements) {
    await client.unsafe(statement);
  }
  console.log(`Applied ${statements.length} statements from ${filePath}`);
} finally {
  await client.end({ timeout: 1 });
}
