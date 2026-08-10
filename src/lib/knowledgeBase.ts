import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type KnowledgeBaseContextOptions = {
  userId?: string;
  topicIds?: string[];
  maxChars?: number;
  includeArchived?: boolean;
};

export async function fetchKnowledgeBaseContext(
  opts: KnowledgeBaseContextOptions = {},
): Promise<string> {
  const maxChars = opts.maxChars ?? 24000;

  try {
    let topicQuery = supabaseAdmin
      .from("knowledge_topics")
      .select("id, title, description")
      .order("updated_at", { ascending: false });

    if (opts.userId) {
      topicQuery = topicQuery.eq("user_id", opts.userId);
    }
    if (opts.topicIds && opts.topicIds.length > 0) {
      topicQuery = topicQuery.in("id", opts.topicIds);
    }
    if (!opts.includeArchived) {
      topicQuery = topicQuery.eq("is_archived", false);
    }

    const { data: topics, error: topicsError } = await topicQuery;
    if (topicsError || !topics || topics.length === 0) {
      return "";
    }

    const topicIds = topics.map((t) => t.id as string);
    const titleByTopic = new Map<string, string>(
      topics.map((t) => [t.id as string, (t.title as string) || "Untitled Topic"]),
    );
    const descByTopic = new Map<string, string | null>(
      topics.map((t) => [t.id as string, (t.description as string | null) ?? null]),
    );

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("knowledge_messages")
      .select("topic_id, role, content, created_at")
      .in("topic_id", topicIds)
      .order("created_at", { ascending: true });

    if (messagesError || !messages || messages.length === 0) {
      const descLines: string[] = [];
      for (const [tid, title] of titleByTopic) {
        const desc = descByTopic.get(tid);
        if (desc && desc.trim()) {
          descLines.push(`# Topic: ${title}`);
          descLines.push(desc.trim());
          descLines.push("");
        }
      }
      return descLines.join("\n");
    }

    const byTopic = new Map<
      string,
      Array<{ role: string; content: string }>
    >();
    for (const msg of messages) {
      const tid = msg.topic_id as string;
      const arr = byTopic.get(tid) ?? [];
      arr.push({
        role: (msg.role as string) || "user",
        content: (msg.content as string) || "",
      });
      byTopic.set(tid, arr);
    }

    const sections: string[] = [];
    for (const topicId of topicIds) {
      const title = titleByTopic.get(topicId) || "Untitled Topic";
      const desc = descByTopic.get(topicId);
      const msgs = byTopic.get(topicId);
      if ((!msgs || msgs.length === 0) && !desc) continue;

      sections.push(`# Knowledge Base Topic: ${title}`);
      if (desc && desc.trim()) {
        sections.push(`Description: ${desc.trim()}`);
      }
      if (msgs && msgs.length > 0) {
        for (const m of msgs) {
          const label = m.role === "assistant" ? "Knowledge" : "Staff Note";
          const cleaned = m.content.trim();
          if (!cleaned) continue;
          sections.push(`[${label}]`);
          sections.push(cleaned);
        }
      }
      sections.push("");
    }

    let result = sections.join("\n");

    if (result.length > maxChars) {
      result =
        "...[earlier knowledge base content truncated for length]\n\n" +
        result.slice(result.length - maxChars);
    }

    return result;
  } catch (err) {
    console.error("[knowledgeBase] Failed to fetch context:", err);
    return "";
  }
}

export const KNOWLEDGE_BASE_PREAMBLE =
  `You have access to the clinic's internal AI Knowledge Base below. Treat it as the PRIMARY source of truth for all clinic-specific facts, policies, procedures, services, pricing guidance, protocols, tone of voice, and communication templates. When generating content, you MUST prefer information from the Knowledge Base over any general knowledge. If the Knowledge Base does not contain an answer, say so or stay generic rather than inventing clinic-specific details.`;

export async function buildKnowledgeBaseSection(
  opts: KnowledgeBaseContextOptions = {},
): Promise<string> {
  const body = await fetchKnowledgeBaseContext(opts);
  if (!body.trim()) return "";
  return `

${KNOWLEDGE_BASE_PREAMBLE}

--- KNOWLEDGE BASE START ---
${body}
--- KNOWLEDGE BASE END ---
`;
}
