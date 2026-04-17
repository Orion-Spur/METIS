import { NextResponse } from "next/server";
import { z } from "zod";
import { createScryptHash, getCurrentSession } from "@/lib/auth";
import { listUsersForAdmin, upsertPasswordUser } from "@/lib/db";

const createUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  role: z.enum(["user", "admin"]).default("user"),
});

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session?.username) {
    return { error: NextResponse.json({ error: "Unauthorised" }, { status: 401 }) };
  }
  if (session.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) {
    return auth.error;
  }

  const users = await listUsersForAdmin();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) {
    return auth.error;
  }

  const body = createUserSchema.parse(await request.json());
  await upsertPasswordUser({
    username: body.username,
    passwordHash: createScryptHash(body.password),
    role: body.role,
    email: body.email || null,
    name: body.name?.trim() || body.username,
    isActive: true,
  });

  const users = await listUsersForAdmin();
  return NextResponse.json({ users });
}
