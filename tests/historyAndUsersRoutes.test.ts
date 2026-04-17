import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const listCouncilTurns = vi.fn();
const listRecentSessions = vi.fn();
const listRelevantSessionInsights = vi.fn();
const searchSessionPreviews = vi.fn();
const listUsersForAdmin = vi.fn();
const upsertPasswordUser = vi.fn();
const updateUserAccess = vi.fn();
const updateUserRole = vi.fn();
const createScryptHash = vi.fn();

vi.mock("@/lib/auth", () => ({
  getCurrentSession,
  createScryptHash,
}));

vi.mock("@/lib/db", () => ({
  listCouncilTurns,
  listRecentSessions,
  listRelevantSessionInsights,
  searchSessionPreviews,
  listUsersForAdmin,
  upsertPasswordUser,
  updateUserAccess,
  updateUserRole,
}));

async function loadHistoryRoute() {
  vi.resetModules();
  return import("@/app/api/history/route");
}

async function loadUsersRoute() {
  vi.resetModules();
  return import("@/app/api/users/route");
}

async function loadUserDetailRoute() {
  vi.resetModules();
  return import("@/app/api/users/[id]/route");
}

describe("METIS history route", () => {
  beforeEach(() => {
    getCurrentSession.mockReset();
    listCouncilTurns.mockReset();
    listRecentSessions.mockReset();
    listRelevantSessionInsights.mockReset();
    searchSessionPreviews.mockReset();
    listUsersForAdmin.mockReset();
    upsertPasswordUser.mockReset();
    updateUserAccess.mockReset();
    updateUserRole.mockReset();
    createScryptHash.mockReset();
  });

  it("returns session history, selected turns, and relevant insights for an authenticated user", async () => {
    getCurrentSession.mockResolvedValue({ userId: 7, username: "orion", role: "admin" });
    searchSessionPreviews.mockResolvedValue([
      {
        sessionId: "session-1",
        title: "Go-to-market council",
        summary: "Metis favoured a staged launch.",
        updatedAt: 1710000000000,
        createdAt: 1710000000000,
        lastMessageAt: 1710000000000,
        turnCount: 2,
        matchedText: "staged launch",
      },
    ]);
    listCouncilTurns.mockResolvedValue([
      {
        sessionId: "session-1",
        userMessage: "How should we stage the launch?",
        discussion: [],
        synthesis: {
          agentName: "Metis",
          content: "Stage the rollout.",
          sequenceOrder: 1,
          confidence: 0.8,
          recommendedAction: "proceed",
          summaryRationale: "Evidence favours a narrower first step.",
        },
        createdAt: 1710000000000,
      },
    ]);
    listRelevantSessionInsights.mockResolvedValue([
      {
        id: 1,
        sessionId: "session-0",
        title: "Prior launch lesson",
        insight: "Keep the initial market narrow.",
        rationale: "Earlier rollout discussions converged on focus.",
        tags: ["launch", "focus"],
        updatedAt: 1710000000000,
      },
    ]);

    const route = await loadHistoryRoute();
    const response = await route.GET(new Request("http://localhost/api/history?q=launch&session=session-1"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(searchSessionPreviews).toHaveBeenCalledWith(7, "launch");
    expect(listCouncilTurns).toHaveBeenCalledWith("session-1", 7);
    expect(listRelevantSessionInsights).toHaveBeenCalledWith({
      userId: 7,
      query: "launch",
      excludeSessionId: "session-1",
      limit: 4,
    });
    expect(payload.sessions).toHaveLength(1);
    expect(payload.turns).toHaveLength(1);
    expect(payload.insights).toHaveLength(1);
  });

  it("rejects unauthenticated history requests", async () => {
    getCurrentSession.mockResolvedValue(null);
    const route = await loadHistoryRoute();
    const response = await route.GET(new Request("http://localhost/api/history"));
    expect(response.status).toBe(401);
  });
});

describe("METIS user administration routes", () => {
  beforeEach(() => {
    getCurrentSession.mockReset();
    listUsersForAdmin.mockReset();
    upsertPasswordUser.mockReset();
    updateUserAccess.mockReset();
    updateUserRole.mockReset();
    createScryptHash.mockReset();
  });

  it("lets an admin create a password user and returns the refreshed directory", async () => {
    getCurrentSession.mockResolvedValue({ userId: 1, username: "orion", role: "admin" });
    createScryptHash.mockReturnValue("hashed-password");
    listUsersForAdmin.mockResolvedValue([
      {
        id: 9,
        username: "athena",
        email: "athena@example.com",
        name: "Athena",
        role: "user",
        isActive: true,
        lastSignedIn: 1710000000000,
        createdAt: 1710000000000,
      },
    ]);

    const route = await loadUsersRoute();
    const response = await route.POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "athena",
          password: "supersafepass",
          name: "Athena",
          email: "athena@example.com",
          role: "user",
        }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(createScryptHash).toHaveBeenCalledWith("supersafepass");
    expect(upsertPasswordUser).toHaveBeenCalledWith({
      username: "athena",
      passwordHash: "hashed-password",
      role: "user",
      email: "athena@example.com",
      name: "Athena",
      isActive: true,
    });
    expect(payload.users).toHaveLength(1);
  });

  it("blocks non-admin user creation", async () => {
    getCurrentSession.mockResolvedValue({ userId: 2, username: "guest", role: "user" });
    const route = await loadUsersRoute();
    const response = await route.POST(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "blocked", password: "supersafepass" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("lets an admin toggle role and access for an existing user", async () => {
    getCurrentSession.mockResolvedValue({ userId: 1, username: "orion", role: "admin" });
    listUsersForAdmin.mockResolvedValue([
      {
        id: 4,
        username: "loki",
        email: null,
        name: "Loki",
        role: "admin",
        isActive: false,
        lastSignedIn: 1710000000000,
        createdAt: 1710000000000,
      },
    ]);

    const route = await loadUserDetailRoute();
    const response = await route.PATCH(
      new Request("http://localhost/api/users/4", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "admin", isActive: false }),
      }),
      { params: Promise.resolve({ id: "4" }) },
    );

    expect(response.status).toBe(200);
    expect(updateUserRole).toHaveBeenCalledWith(4, "admin");
    expect(updateUserAccess).toHaveBeenCalledWith(4, false);
  });
});
