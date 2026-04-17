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

export type MetisCouncilMessage = MetisAgentOutput & {
  sequenceOrder: number;
};

export type MetisCouncilTurn = {
  sessionId: string;
  userMessage: string;
  discussion: MetisCouncilMessage[];
  synthesis: MetisCouncilMessage;
  createdAt: number;
};

export type MetisSessionPreview = {
  sessionId: string;
  title: string;
  summary: string | null;
  updatedAt: number;
  createdAt: number;
  lastMessageAt: number;
  turnCount: number;
  matchedText: string | null;
};

export type MetisSessionInsight = {
  id: number;
  sessionId: string;
  title: string;
  insight: string;
  rationale: string | null;
  tags: string[];
  updatedAt: number;
};

export type MetisUserAdminRecord = {
  id: number;
  username: string | null;
  email: string | null;
  name: string | null;
  role: "user" | "admin";
  isActive: boolean;
  lastSignedIn: number;
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
    title: "Council Chair",
    accentClassName: "text-primary",
    borderClassName: "border-primary/40",
    glowClassName: "shadow-[0_0_40px_rgba(205,158,60,0.15)]",
    description:
      "Metis convenes the room, keeps the exchange productive, and delivers the final synthesis on Orion's behalf.",
  },
  Athena: {
    title: "Selected Member",
    accentClassName: "text-sky-300",
    borderClassName: "border-sky-300/30",
    glowClassName: "shadow-[0_0_40px_rgba(125,211,252,0.12)]",
    description:
      "Athena was selected because she brings a distinctive ability to clarify direction, sequence choices, and turn ambiguity into a coherent path.",
  },
  Argus: {
    title: "Selected Member",
    accentClassName: "text-purple-300",
    borderClassName: "border-purple-300/30",
    glowClassName: "shadow-[0_0_40px_rgba(216,180,254,0.12)]",
    description:
      "Argus was selected because he brings a distinctive ability to test evidence, expose assumptions, and sharpen the standard of proof.",
  },
  Loki: {
    title: "Selected Member",
    accentClassName: "text-green-300",
    borderClassName: "border-green-300/30",
    glowClassName: "shadow-[0_0_40px_rgba(134,239,172,0.12)]",
    description:
      "Loki was selected because he brings a distinctive ability to challenge weak logic, surface failure modes, and prevent easy consensus.",
  },
};
