export const metisAgentNames = ["Metis", "Athena", "Argus", "Loki"] as const;

export type MetisAgentName = (typeof metisAgentNames)[number];

export type MetisRecommendedAction =
  | "proceed"
  | "revise"
  | "defer"
  | "escalate"
  | "request_clarification";

export type MetisAgentOutput = {
  agentName: MetisAgentName;
  confidence: number;
  recommendedAction: MetisRecommendedAction;
  summaryRationale: string;
  content: string;
};

export type MetisCouncilTurn = {
  sessionId: string;
  userMessage: string;
  outputs: MetisAgentOutput[];
  synthesis: MetisAgentOutput;
  createdAt: number;
};

export const metisAgentProfiles: Record<
  MetisAgentName,
  {
    title: string;
    accentClassName: string;
    borderClassName: string;
    glowClassName: string;
    description: string;
  }
> = {
  Metis: {
    title: "Orchestrator",
    accentClassName: "text-primary",
    borderClassName: "border-primary/40",
    glowClassName: "shadow-[0_0_40px_rgba(205,158,60,0.15)]",
    description:
      "Coordinates the council, reconciles disagreements, and presents the final synthesis.",
  },
  Athena: {
    title: "Strategist",
    accentClassName: "text-sky-300",
    borderClassName: "border-sky-300/30",
    glowClassName: "shadow-[0_0_40px_rgba(125,211,252,0.12)]",
    description:
      "Frames priorities, routes decisions, and converts intent into a practical plan.",
  },
  Argus: {
    title: "Analyst",
    accentClassName: "text-emerald-300",
    borderClassName: "border-emerald-300/30",
    glowClassName: "shadow-[0_0_40px_rgba(110,231,183,0.12)]",
    description:
      "Examines evidence, patterns, and trade-offs before the council acts.",
  },
  Loki: {
    title: "Critic",
    accentClassName: "text-rose-300",
    borderClassName: "border-rose-300/30",
    glowClassName: "shadow-[0_0_40px_rgba(253,164,175,0.12)]",
    description:
      "Challenges assumptions, stress-tests the plan, and exposes weak reasoning.",
  },
};
