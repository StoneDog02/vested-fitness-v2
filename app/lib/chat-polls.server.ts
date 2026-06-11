import type { ChatPollData, PollOptionData, PollVoter } from "~/lib/chat.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "~/lib/supabase";

type ServiceClient = SupabaseClient<Database>;

export async function fetchPollsForMessages(
  supabase: ServiceClient,
  messageIds: string[],
  currentUserId: string
): Promise<Record<string, ChatPollData>> {
  if (messageIds.length === 0) return {};

  const { data: polls } = await supabase
    .from("chat_polls")
    .select("id, message_id, question")
    .in("message_id", messageIds);

  if (!polls?.length) return {};

  const pollIds = polls.map((p) => p.id);

  const { data: options } = await supabase
    .from("chat_poll_options")
    .select("id, poll_id, label, position")
    .in("poll_id", pollIds)
    .order("position", { ascending: true });

  const { data: votes } = await supabase
    .from("chat_poll_votes")
    .select("poll_id, option_id, user_id, created_at, users(name, avatar_url)")
    .in("poll_id", pollIds)
    .order("created_at", { ascending: false });

  const result: Record<string, ChatPollData> = {};

  for (const poll of polls) {
    const pollOptions = (options ?? []).filter((o) => o.poll_id === poll.id);
    const pollVotes = (votes ?? []).filter((v) => v.poll_id === poll.id);
    const userVote = pollVotes.find((v) => v.user_id === currentUserId);

    const optionData: PollOptionData[] = pollOptions.map((opt) => {
      const optVotes = pollVotes
        .filter((v) => v.option_id === opt.id)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      const voters: PollVoter[] = optVotes.map((v) => {
        const uRaw = v.users;
        const u = (Array.isArray(uRaw) ? uRaw[0] : uRaw) as
          | { name: string; avatar_url: string | null }
          | null;
        return {
          user_id: v.user_id,
          name: u?.name?.trim() || "Unknown user",
          avatar_url: u?.avatar_url ?? null,
        };
      });
      return {
        id: opt.id,
        label: opt.label,
        position: opt.position,
        vote_count: optVotes.length,
        voters,
      };
    });

    result[poll.message_id] = {
      poll_id: poll.id,
      message_id: poll.message_id,
      question: poll.question,
      options: optionData,
      total_votes: pollVotes.length,
      user_vote_option_id: userVote?.option_id ?? null,
    };
  }

  return result;
}
