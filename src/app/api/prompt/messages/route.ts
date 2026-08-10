import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get("topicId");
    const userId = searchParams.get("userId");

    if (!topicId || !userId) {
      return NextResponse.json({ error: "topicId and userId are required" }, { status: 400 });
    }

    const { data: topic, error: topicError } = await supabaseAdmin
      .from("knowledge_topics")
      .select("id")
      .eq("id", topicId)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("knowledge_messages")
      .select(`
        id,
        role,
        content,
        has_attachments,
        model_used,
        created_at,
        knowledge_attachments (
          id,
          file_name,
          file_type,
          file_size,
          mime_type,
          storage_path,
          thumbnail_path
        )
      `)
      .eq("topic_id", topicId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json({ error: messagesError.message }, { status: 500 });
    }

    const messagesWithUrls = await Promise.all(
      (messages || []).map(async (msg) => {
        const attachments = (msg.knowledge_attachments as unknown as { storage_path: string; thumbnail_path: string | null; [key: string]: unknown }[]) || [];
        const attachmentsWithUrls = await Promise.all(
          attachments.map(async (att: { storage_path: string; thumbnail_path: string | null; [key: string]: unknown }) => {
            let url = null;
            let thumbnailUrl = null;

            if (att.storage_path) {
              const { data } = await supabaseAdmin.storage
                .from("knowledge-files")
                .createSignedUrl(att.storage_path, 3600);
              url = data?.signedUrl || null;
            }

            if (att.thumbnail_path) {
              const { data } = await supabaseAdmin.storage
                .from("knowledge-files")
                .createSignedUrl(att.thumbnail_path, 3600);
              thumbnailUrl = data?.signedUrl || null;
            }

            return { ...att, url, thumbnailUrl };
          })
        );

        return {
          ...msg,
          attachments: attachmentsWithUrls,
        };
      })
    );

    return NextResponse.json({ messages: messagesWithUrls });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
