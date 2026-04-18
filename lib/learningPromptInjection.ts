import type { MetisCouncilLearning, MetisLearningKind } from "@/shared/metis";

const KIND_HEADER: Record<MetisLearningKind, string> = {
  decision: "Prior decisions",
  commitment: "Prior commitments",
  principle: "Principles in force",
  rejected_option: "Previously rejected",
  risk: "Known risks",
  open_question: "Unresolved questions",
};

const KIND_ORDER: MetisLearningKind[] = [
  "decision",
  "commitment",
  "principle",
  "rejected_option",
  "risk",
  "open_question",
];

export function buildLearningsBlock(learnings: MetisCouncilLearning[] | undefined): string {
  if (!learnings || learnings.length === 0) {
    return "Prior council memory: None retrieved for this brief. Do not invent prior outcomes.";
  }

  const grouped = new Map<MetisLearningKind, MetisCouncilLearning[]>();
  for (const learning of learnings) {
    const bucket = grouped.get(learning.kind) ?? [];
    bucket.push(learning);
    grouped.set(learning.kind, bucket);
  }

  const lines: string[] = ["Prior council memory:"];

  for (const kind of KIND_ORDER) {
    const bucket = grouped.get(kind);
    if (!bucket || bucket.length === 0) continue;
    lines.push("", KIND_HEADER[kind] + ":");
    for (const entry of bucket) {
      const confidenceLabel =
        entry.confidence === "firm" ? "" : ` [${entry.confidence}]`;
      const dissent = entry.dissent ? ` | Surviving dissent: ${entry.dissent}` : "";
      lines.push(`- ${entry.statement}${confidenceLabel}${dissent}`);
    }
  }

  lines.push(
    "",
    "Treat firm decisions as current truth. Treat provisional and exploratory notes as material the council may revisit."
  );

  return lines.join("\n");
}
