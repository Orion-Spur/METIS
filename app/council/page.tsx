import { redirect } from "next/navigation";
import CouncilInterface from "@/components/CouncilInterface";
import { getCurrentSession } from "@/lib/auth";
import { listCouncilTurns, listRecentSessions, listUsersForAdmin } from "@/lib/db";

export default async function CouncilPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session?.username) {
    redirect("/");
  }

  const params = await searchParams;
  const sessionId = params.session;
  const [initialTurns, initialSessions, initialUsers] = await Promise.all([
    sessionId ? listCouncilTurns(sessionId, session.userId) : Promise.resolve([]),
    listRecentSessions(session.userId),
    session.role === "admin" ? listUsersForAdmin() : Promise.resolve([]),
  ]);

  return (
    <CouncilInterface
      initialSessionId={sessionId}
      initialTurns={initialTurns}
      initialSessions={initialSessions}
      initialUsers={initialUsers}
      username={session.username}
      userRole={session.role}
    />
  );
}
