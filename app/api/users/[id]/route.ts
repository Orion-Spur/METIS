import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { listUsersForAdmin, updateUserAccess, updateUserRole } from "@/lib/db";

const paramsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const updateSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  isActive: z.boolean().optional(),
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) {
    return auth.error;
  }

  const { id } = paramsSchema.parse(await context.params);
  const body = updateSchema.parse(await request.json());

  if (typeof body.role !== "undefined") {
    await updateUserRole(id, body.role);
  }

  if (typeof body.isActive !== "undefined") {
    await updateUserAccess(id, body.isActive);
  }

  const users = await listUsersForAdmin();
  return NextResponse.json({ users });
}
