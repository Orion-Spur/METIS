import type { MetisCouncilMessage } from "@/shared/metis";

// Signals that a message introduces something new to the room.
// We look for: novel numeric thresholds, new agent names referenced,
// and substantial new vocabulary beyond what prior messages contained.

export type NoveltySignal = {
  score: number; // 0 to 1
  reasons: string[];
};

const NUMBER_PATTERN = /\b\d+(?:[.,]\d+)?(?:%|k|m|bn|£|\$|€)?\b/gi;
const THRESHOLD_WORDS = [
  "threshold",
  "baseline",
  "ceiling",
  "floor",
  "minimum",
  "maximum",
  "target",
  "benchmark",
];

function extractNumbers(text: string): Set<string> {
  const matches = text.match(NUMBER_PATTERN) ?? [];
  return new Set(matches.map((m) => m.toLowerCase()));
}

function extractContentWords(text: string): Set<string> {
  // Content words: 5+ letters, not common connectives. Rough but cheap.
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "against",
    "because",
    "before",
    "between",
    "could",
    "every",
    "first",
    "their",
    "there",
    "these",
    "those",
    "under",
    "where",
    "which",
    "while",
    "would",
    "should",
    "still",
    "though",
    "through",
  ]);
  const tokens = text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? [];
  return new Set(tokens.filter((w) => !stopWords.has(w)));
}

function containsNewThresholdLanguage(currentText: string, priorText: string): boolean {
  const lowerCurrent = currentText.toLowerCase();
  const lowerPrior = priorText.toLowerCase();
  return THRESHOLD_WORDS.some((word) => lowerCurrent.includes(word) && !lowerPrior.includes(word));
}

export function scoreNovelty(
  current: MetisCouncilMessage,
  priorMessages: MetisCouncilMessage[]
): NoveltySignal {
  const reasons: string[] = [];

  if (priorMessages.length === 0) {
    return { score: 1, reasons: ["first message in round"] };
  }

  const priorText = priorMessages.map((m) => m.content).join(" ");
  const priorNumbers = extractNumbers(priorText);
  const priorWords = extractContentWords(priorText);

  const currentNumbers = extractNumbers(current.content);
  const currentWords = extractContentWords(current.content);

  const newNumbers = [...currentNumbers].filter((n) => !priorNumbers.has(n));
  const newWords = [...currentWords].filter((w) => !priorWords.has(w));

  let score = 0;

  // Novel numbers are high-signal — they mean someone introduced a
  // concrete threshold, benchmark, or measurement.
  if (newNumbers.length > 0) {
    score += 0.4;
    reasons.push(`${newNumbers.length} new numeric value(s)`);
  }

  // Threshold vocabulary, but only if it's NEW to the discussion. If the
  // prior context already said "baseline", another speaker saying "baseline"
  // isn't novelty.
  if (containsNewThresholdLanguage(current.content, priorText)) {
    score += 0.2;
    reasons.push("new threshold/baseline language");
  }

  // Substantial new vocabulary suggests new territory. We weight this
  // lightly because paraphrasing alone can introduce new words.
  const noveltyRatio = currentWords.size > 0 ? newWords.length / currentWords.size : 0;
  if (noveltyRatio > 0.5) {
    score += 0.3;
    reasons.push(`${Math.round(noveltyRatio * 100)}% new content words`);
  } else if (noveltyRatio > 0.25) {
    score += 0.15;
    reasons.push(`${Math.round(noveltyRatio * 100)}% new content words`);
  }

  // Naming another speaker is a sign of engagement but not of novelty,
  // so we add a small bonus only if it's combined with new content.
  const referencesOtherSpeaker = /\b(Metis|Athena|Argus|Loki|Orion)\b/.test(current.content);
  if (referencesOtherSpeaker && newWords.length > 3) {
    score += 0.1;
    reasons.push("engages another speaker with new material");
  }

  return {
    score: Math.min(1, score),
    reasons,
  };
}

// A round is "low-progress" if the average novelty of its messages is
// below a threshold. We use 0.3 as the cutoff — calibrated so that
// genuine repetition scores low while substantive pushback scores high.

const LOW_PROGRESS_THRESHOLD = 0.3;

export function isLowProgressRound(
  roundMessages: MetisCouncilMessage[],
  priorContext: MetisCouncilMessage[] = []
): boolean {
  if (roundMessages.length === 0) return false;

  let cumulativeScore = 0;
  for (let i = 0; i < roundMessages.length; i += 1) {
    // The "prior" for any message in this round is the full prior context
    // (everything before the round started) PLUS any earlier messages
    // within this round. This way the first speaker of round 2 is scored
    // against the content of round 1, not treated as trivially novel.
    const prior = [...priorContext, ...roundMessages.slice(0, i)];
    cumulativeScore += scoreNovelty(roundMessages[i], prior).score;
  }

  const average = cumulativeScore / roundMessages.length;
  return average < LOW_PROGRESS_THRESHOLD;
}

// Detect the "two consecutive low-progress rounds" condition that
// should force the chair to either synthesise or declare deadlock.

export function shouldForceClosure(
  discussion: MetisCouncilMessage[],
  roundSize: number
): { force: boolean; reason: string } {
  if (discussion.length < roundSize * 2) {
    return { force: false, reason: "not enough rounds yet" };
  }

  const lastRound = discussion.slice(-roundSize);
  const priorRound = discussion.slice(-roundSize * 2, -roundSize);
  const contextBeforePriorRound = discussion.slice(0, -roundSize * 2);

  const lastLow = isLowProgressRound(lastRound, [...contextBeforePriorRound, ...priorRound]);
  const priorLow = isLowProgressRound(priorRound, contextBeforePriorRound);

  if (lastLow && priorLow) {
    return {
      force: true,
      reason: "two consecutive rounds produced no substantive progress",
    };
  }

  return { force: false, reason: "at least one recent round introduced new material" };
}
