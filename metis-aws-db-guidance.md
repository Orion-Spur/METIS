# METIS AWS Database Recommendation

For **METIS**, the best choice from the AWS options you showed is **Amazon Aurora PostgreSQL**.

Aurora PostgreSQL is the strongest fit because METIS needs **relational data**, **transactions**, **foreign keys**, **chronological chat history**, and a clear path to more advanced querying later, such as session analytics, audit history, user access control, saved briefs, and memory layers. AWS documents Aurora as a **PostgreSQL-compatible relational database** inside the Aurora family, while DynamoDB is a **NoSQL key-value/document database** and Aurora DSQL is a newer **distributed SQL** option oriented toward elastic scale rather than the most straightforward first production schema for an app like this.[1] [2] [3]

## Recommendation Table

| AWS option | Fit for METIS | Recommendation |
|---|---|---|
| **Amazon Aurora PostgreSQL** | Best fit for users, sessions, messages, agent outputs, SQL joins, indexing, and future analytics | **Use this now** |
| **Amazon Aurora DSQL** | Interesting for future distributed scale, but not the simplest first production choice for METIS | Not first choice |
| **Amazon DynamoDB** | Fast and scalable, but awkward for this relational chat/session model and admin querying | Not recommended for v1 |

## Important Note About Login

The **current METIS app login is still environment-based**, not database-based. Right now, access is controlled by `METIS_LOGIN_USERNAME` together with `METIS_LOGIN_PASSWORD` or `METIS_LOGIN_PASSWORD_HASH` in environment variables.

That means the SQL below will let you **start recording chats immediately** and will also create a **proper users table** for the next step, but **your current login flow will not start reading from the database until I change the auth code to use DB-backed users**.

So the practical path is:

| Step | What it gives you |
|---|---|
| **1. Run the SQL now** | Creates the tables for users, council sessions, and council messages |
| **2. Keep current env-based login temporarily** | Lets you log in immediately without blocking on an auth refactor |
| **3. Then switch auth to DB-backed login** | Lets METIS authenticate directly against the `users` table |

## What the SQL Creates

The accompanying SQL file creates:

| Table | Purpose |
|---|---|
| `users` | Stores login identity, role, and password hash for future DB-backed auth |
| `council_sessions` | Stores each METIS chat session |
| `council_messages` | Stores each user prompt, agent output, and final synthesis |

It also adds indexes so chat history and user lookups remain efficient as METIS grows.

## References

[1] [Amazon Aurora PostgreSQL – AWS Documentation](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraPostgreSQL.html)
[2] [Amazon DynamoDB – AWS Documentation](https://docs.aws.amazon.com/dynamodb/)
[3] [Amazon Aurora DSQL – AWS Documentation](https://docs.aws.amazon.com/aurora-dsql/)
