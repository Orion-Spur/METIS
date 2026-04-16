import { redirect } from "next/navigation";
import CouncilInterface from "@/components/CouncilInterface";
import { getCurrentSession } from "@/lib/auth";
import { listCouncilTurns } from "@/lib/db";

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
  const initialTurns = sessionId ? await listCouncilTurns(sessionId) : [];

  return (
    <CouncilInterface
      initialSessionId={sessionId}
      initialTurns={initialTurns}
      username={session.username}
    />
  );
}
