# METIS AWS Database Guidance v2

For **METIS today**, the most practical database choice is **Amazon Aurora MySQL-Compatible** because the active application schema is currently built on a **MySQL Drizzle model**. That gives you the cleanest path to start recording chats immediately with the least friction.

If you are choosing strictly from the options visible in your screenshot, then **Amazon Aurora PostgreSQL** is the best *architectural* choice among those three for a relational multi-agent application, but it would require a small schema and code migration because the current METIS codebase is not yet PostgreSQL-native. AWS documents Aurora as a relational engine family compatible with both MySQL and PostgreSQL, while DynamoDB is a NoSQL service and Aurora DSQL is a newer distributed SQL option rather than the simplest first fit for the current METIS app.[1] [2] [3]

## Recommendation

| Scenario | Best choice | Why |
|---|---|---|
| **Fastest path with the current METIS code** | **Aurora MySQL-Compatible** | Matches the active MySQL-flavoured schema and minimizes refactoring |
| **Best relational option from the screenshot only** | **Aurora PostgreSQL** | Best long-term relational fit, but requires a migration step |
| **Do not use for METIS v1** | **DynamoDB** | Poor fit for joins, ordered council transcripts, and relational admin queries |

## Important Login Note

The **current METIS login is not database-backed yet**. Right now, login access is controlled by environment variables:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs and verifies the session cookie |
| `METIS_LOGIN_USERNAME` | Your login username |
| `METIS_LOGIN_PASSWORD` or `METIS_LOGIN_PASSWORD_HASH` | Your login password or password hash |

So if your goal is **to start recording chats now**, run the SQL in the attached MySQL schema file.

If your goal is **to log in right now**, you do **not** need SQL yet. You need the auth environment variables set correctly in the deployment environment.

## What the SQL File Does

The attached SQL file matches the **current active METIS schema** and creates these tables:

| Table | Purpose |
|---|---|
| `users` | Keeps the app’s current user record structure |
| `councilSessions` | Stores each METIS conversation/session |
| `councilMessages` | Stores prompts, agent replies, and synthesis outputs |

This means you can begin storing chat history immediately without waiting for a larger auth rewrite.

## If You Want DB-Backed Login Next

The next step after this is a small auth refactor so METIS authenticates against a password-hash table in the database instead of environment variables. I can do that next once the database is provisioned.

## References

[1] [Amazon Aurora – AWS](https://aws.amazon.com/rds/aurora/)
[2] [Amazon Aurora PostgreSQL – AWS Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraPostgreSQL.html)
[3] [Amazon DynamoDB – AWS Documentation](https://docs.aws.amazon.com/dynamodb/)
