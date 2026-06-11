import React, { useState } from "react";
import type { ChatPollData, PollVoter } from "~/lib/chat.types";
import PollVotersModal from "./PollVotersModal";

interface PollMessageProps {
  poll: ChatPollData;
  onVote: (optionId: string) => void;
  voting?: boolean;
  mutedColor: string;
  textColor: string;
  /** Bubble background — used for avatar ring separation. */
  surfaceColor: string;
}

const AVATAR_PALETTE = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
];

function avatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash + userId.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return AVATAR_PALETTE[hash];
}

type AvatarSlot =
  | { kind: "voter"; voter: PollVoter }
  | { kind: "overflow"; count: number };

/** Build left→right avatar slots (newest on the right). Max 3 visible. */
function buildAvatarSlots(voters: PollVoter[]): AvatarSlot[] {
  if (voters.length === 0) return [];

  if (voters.length <= 3) {
    return [...voters].reverse().map((voter) => ({ kind: "voter" as const, voter }));
  }

  const mostRecent = voters[0];
  const secondRecent = voters[1];
  const overflowCount = voters.length - 2;

  return [
    { kind: "overflow", count: overflowCount },
    { kind: "voter", voter: secondRecent },
    { kind: "voter", voter: mostRecent },
  ];
}

function VoterAvatar({
  voter,
  surfaceColor,
}: {
  voter: PollVoter;
  surfaceColor: string;
}) {
  if (voter.avatar_url) {
    return (
      <img
        src={voter.avatar_url}
        alt=""
        className="w-6 h-6 rounded-full object-cover"
        style={{ boxShadow: `0 0 0 2px ${surfaceColor}` }}
      />
    );
  }

  return (
    <div
      className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-semibold ${avatarColor(voter.user_id)}`}
      style={{ boxShadow: `0 0 0 2px ${surfaceColor}` }}
    >
      {voter.name.charAt(0).toUpperCase()}
    </div>
  );
}

function VoterAvatars({
  voters,
  surfaceColor,
  onShowAll,
}: {
  voters: PollVoter[];
  surfaceColor: string;
  onShowAll: () => void;
}) {
  if (voters.length === 0) return null;

  const slots = buildAvatarSlots(voters);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onShowAll();
      }}
      className="flex items-center rounded-full p-0.5 -m-0.5 hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={`View ${voters.length} voter${voters.length === 1 ? "" : "s"}`}
    >
      <div className="flex items-center">
        {slots.map((slot, index) => (
          <div
            key={slot.kind === "voter" ? slot.voter.user_id : "overflow"}
            className="relative flex-shrink-0"
            style={{
              marginLeft: index === 0 ? 0 : -6,
              zIndex: index + 1,
            }}
          >
            {slot.kind === "overflow" ? (
              <div
                className="w-6 h-6 rounded-full bg-gray-500 dark:bg-gray-600 text-white flex items-center justify-center text-[9px] font-bold leading-none"
                style={{ boxShadow: `0 0 0 2px ${surfaceColor}` }}
              >
                +{slot.count}
              </div>
            ) : (
              <VoterAvatar voter={slot.voter} surfaceColor={surfaceColor} />
            )}
          </div>
        ))}
      </div>
    </button>
  );
}

function PollOptionResult({
  option,
  totalVotes,
  isUserChoice,
  textColor,
  mutedColor,
  surfaceColor,
  onShowVoters,
}: {
  option: ChatPollData["options"][0];
  totalVotes: number;
  isUserChoice: boolean;
  textColor: string;
  mutedColor: string;
  surfaceColor: string;
  onShowVoters: (optionLabel: string, voters: PollVoter[]) => void;
}) {
  const pct = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0;
  const hasVotes = option.vote_count > 0;

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${
        isUserChoice ? "ring-1 ring-primary/50" : "ring-1 ring-black/5 dark:ring-white/10"
      }`}
    >
      <div className="absolute inset-0 bg-black/[0.04] dark:bg-white/[0.06]" />
      {hasVotes && (
        <div
          className="absolute inset-y-0 left-0 bg-primary/20 dark:bg-primary/25 transition-all duration-500 ease-out"
          style={{ width: `${Math.max(pct, option.vote_count > 0 ? 8 : 0)}%` }}
        />
      )}
      <div className="relative flex items-center justify-between gap-3 px-3 py-2.5 min-h-[2.75rem]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isUserChoice && (
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          )}
          <span
            className={`text-sm truncate ${isUserChoice ? "font-semibold" : "font-normal"}`}
            style={{ color: textColor }}
          >
            {option.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasVotes && (
            <span className="text-[11px] font-medium tabular-nums" style={{ color: mutedColor }}>
              {pct}%
            </span>
          )}
          <VoterAvatars
            voters={option.voters}
            surfaceColor={surfaceColor}
            onShowAll={() => onShowVoters(option.label, option.voters)}
          />
        </div>
      </div>
    </div>
  );
}

export default function PollMessage({
  poll,
  onVote,
  voting = false,
  mutedColor,
  textColor,
  surfaceColor,
}: PollMessageProps) {
  const hasVoted = !!poll.user_vote_option_id;
  const [isChangingVote, setIsChangingVote] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [votersModal, setVotersModal] = useState<{
    optionLabel: string;
    voters: PollVoter[];
  } | null>(null);

  const showResults = hasVoted && !isChangingVote;
  const showVotingUi = !hasVoted || isChangingVote;

  const handleVote = () => {
    const optionId = selectedOptionId ?? poll.user_vote_option_id;
    if (!optionId) return;
    onVote(optionId);
    setIsChangingVote(false);
    setSelectedOptionId(null);
  };

  const activeSelection = selectedOptionId ?? (isChangingVote ? poll.user_vote_option_id : null);

  return (
    <div className="min-w-[15rem] max-w-[19rem]">
      <p className="font-semibold text-[15px] leading-snug mb-3.5" style={{ color: textColor }}>
        {poll.question}
      </p>

      <div className="flex flex-col gap-2">
        {poll.options.map((option) => {
          const isSelected = activeSelection === option.id;
          const isUserChoice = poll.user_vote_option_id === option.id;

          if (showResults) {
            return (
              <PollOptionResult
                key={option.id}
                option={option}
                totalVotes={poll.total_votes}
                isUserChoice={isUserChoice}
                textColor={textColor}
                mutedColor={mutedColor}
                surfaceColor={surfaceColor}
                onShowVoters={(label, voters) =>
                  setVotersModal({ optionLabel: label, voters })
                }
              />
            );
          }

          return (
            <button
              key={option.id}
              type="button"
              disabled={voting}
              onClick={() => setSelectedOptionId(option.id)}
              className={`w-full text-left rounded-xl px-3 py-2.5 text-sm transition-all ${
                isSelected
                  ? "ring-2 ring-primary bg-primary/10 font-medium shadow-sm"
                  : "ring-1 ring-black/5 dark:ring-white/10 bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
              }`}
              style={{ color: textColor }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? "border-primary bg-primary" : "border-gray-300 dark:border-gray-500"
                  }`}
                >
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span className="truncate">{option.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {showVotingUi && (
        <button
          type="button"
          onClick={handleVote}
          disabled={!activeSelection || voting}
          className={`mt-3.5 w-full rounded-xl py-2.5 text-sm font-semibold transition-all ${
            activeSelection && !voting
              ? "bg-primary text-white shadow-sm hover:bg-primary/90 active:scale-[0.99]"
              : "bg-black/[0.06] dark:bg-white/[0.08] text-gray-400 cursor-not-allowed"
          }`}
        >
          {voting ? "..." : hasVoted && isChangingVote ? "Update vote" : "Vote"}
        </button>
      )}

      {showResults && (
        <button
          type="button"
          onClick={() => {
            setIsChangingVote(true);
            setSelectedOptionId(poll.user_vote_option_id);
          }}
          disabled={voting}
          className="mt-3 w-full py-1.5 text-sm font-medium text-primary/80 hover:text-primary transition-colors disabled:opacity-50"
        >
          Change vote
        </button>
      )}

      {showResults && poll.total_votes > 0 && (
        <p className="mt-1 text-center text-[11px]" style={{ color: mutedColor }}>
          {poll.total_votes} {poll.total_votes === 1 ? "vote" : "votes"}
        </p>
      )}

      <PollVotersModal
        isOpen={!!votersModal}
        onClose={() => setVotersModal(null)}
        optionLabel={votersModal?.optionLabel ?? ""}
        voters={votersModal?.voters ?? []}
      />
    </div>
  );
}
