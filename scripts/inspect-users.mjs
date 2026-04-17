import postgres from 'postgres';

const sql = postgres(process.env.METIS_DATABASE_URL ?? process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

try {
  const rows = await sql`select id, username, role, email from "users" order by id asc limit 10`;
  console.log(JSON.stringify(rows, null, 2));
} finally {
  await sql.end({ timeout: 1 });
}
