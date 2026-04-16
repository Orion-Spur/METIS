import type { MetisCouncilTurn, MetisRecommendedAction } from "@/shared/metis";
import { metisAgentProfiles } from "@/shared/metis";

function formatRecommendedAction(action: MetisRecommendedAction) {
  return action.replaceAll("_", " ");
}

type Props = {
  turn: MetisCouncilTurn;
  turnIndex: number;
};

export default function CouncilTurnCard({ turn, turnIndex }: Props) {
  return (
    <article className="rounded-[1.75rem] border border-[rgba(214,162,79,0.16)] bg-black/20 p-5">
      <header className="rounded-[1.35rem] border border-[rgba(214,162,79,0.18)] bg-[rgba(214,162,79,0.06)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs uppercase tracking-[0.32em] text-[rgba(214,162,79,0.75)]">
            User brief
          </div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-[rgba(243,231,192,0.52)]">
            Turn {turnIndex + 1}
          </div>
        </div>
        <p className="mt-3 text-sm leading-7 text-[rgba(249,239,212,0.92)]">{turn.userMessage}</p>
      </header>

      <section className="mt-4">
        <div className="mb-3 text-xs uppercase tracking-[0.32em] text-[rgba(214,162,79,0.72)]">
          Active discussion
        </div>
        <div className="space-y-3">
          {turn.discussion.map((message) => {
            const profile = metisAgentProfiles[message.agentName];
            return (
              <section
                key={`${turn.createdAt}-${message.sequenceOrder}-${message.agentName}`}
                className={`rounded-[1.35rem] border bg-[rgba(12,10,8,0.9)] p-4 ${profile.borderClassName}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className={`text-xs uppercase tracking-[0.32em] ${profile.accentClassName}`}>
                      {message.agentName}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.26em] text-[rgba(243,231,192,0.48)]">
                      Exchange {message.sequenceOrder}
                    </div>
                  </div>
                  <div className="text-right text-[11px] uppercase tracking-[0.24em] text-[rgba(214,162,79,0.72)]">
                    <div>Confidence {Math.round(message.confidence * 100)}%</div>
                    <div className="mt-1">Action {formatRecommendedAction(message.recommendedAction)}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-[rgba(247,236,209,0.9)]">{message.content}</p>
                <p className="mt-4 text-xs leading-6 text-[rgba(243,231,192,0.65)]">{message.summaryRationale}</p>
              </section>
            );
          })}
        </div>
      </section>

      <section
        className={`mt-4 rounded-[1.5rem] border bg-[rgba(14,10,6,0.94)] p-5 ${metisAgentProfiles.Metis.borderClassName}`}
      >
        <div className={`text-xs uppercase tracking-[0.35em] ${metisAgentProfiles.Metis.accentClassName}`}>
          Metis synthesis
        </div>
        <p className="mt-3 text-sm leading-7 text-[rgba(249,239,212,0.95)]">{turn.synthesis.content}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs uppercase tracking-[0.28em] text-[rgba(214,162,79,0.76)]">
          <span>Confidence {Math.round(turn.synthesis.confidence * 100)}%</span>
          <span>Action {formatRecommendedAction(turn.synthesis.recommendedAction)}</span>
          <span>Exchange {turn.synthesis.sequenceOrder}</span>
        </div>
        <p className="mt-4 text-xs leading-6 text-[rgba(243,231,192,0.7)]">{turn.synthesis.summaryRationale}</p>
      </section>
    </article>
  );
}
