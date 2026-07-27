import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const includeArchived = searchParams.get("includeArchived") === "true";

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("knowledge_topics")
      .select("*")
      .eq("user_id", userId)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });

    if (!includeArchived) {
      query = query.eq("is_archived", false);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching topics:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ topics: data || [] });
  } catch (error) {
    console.error("Error fetching topics:", error);
    return NextResponse.json({ error: "Failed to fetch topics" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, description, icon, color } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data: existingUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("id", userId)
      .single();

    if (!existingUser) {
      const { error: userError } = await supabaseAdmin
        .from("users")
        .insert({ id: userId, email: `user-${userId.slice(0, 8)}@temp.local` })
        .select()
        .single();

      if (userError && !userError.message.includes("duplicate")) {
        console.error("Error creating user:", userError);
        return NextResponse.json({ error: "Failed to create user record" }, { status: 500 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("knowledge_topics")
      .insert({
        user_id: userId,
        title: title || "New Topic",
        description: description || null,
        icon: icon || "sparkles",
        color: color || "sky",
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting topic:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ topic: data });
  } catch (error) {
    console.error("Error creating topic:", error);
    return NextResponse.json({ error: "Failed to create topic" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { topicId, userId, title, description, icon, color, is_pinned, is_archived } = body;

    if (!topicId || !userId) {
      return NextResponse.json({ error: "topicId and userId are required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (icon !== undefined) updates.icon = icon;
    if (color !== undefined) updates.color = color;
    if (is_pinned !== undefined) updates.is_pinned = is_pinned;
    if (is_archived !== undefined) updates.is_archived = is_archived;

    const { data, error } = await supabaseAdmin
      .from("knowledge_topics")
      .update(updates)
      .eq("id", topicId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Error updating topic:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ topic: data });
  } catch (error) {
    console.error("Error updating topic:", error);
    return NextResponse.json({ error: "Failed to update topic" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topicId = searchParams.get("topicId");
    const userId = searchParams.get("userId");

    if (!topicId || !userId) {
      return NextResponse.json({ error: "topicId and userId are required" }, { status: 400 });
    }

    const { data: attachments } = await supabaseAdmin
      .from("knowledge_attachments")
      .select("storage_path, thumbnail_path")
      .eq("topic_id", topicId);

    if (attachments && attachments.length > 0) {
      const paths = attachments
        .flatMap(a => [a.storage_path, a.thumbnail_path])
        .filter(Boolean);
      
      if (paths.length > 0) {
        await supabaseAdmin.storage.from("knowledge-files").remove(paths);
      }
    }

    const { error } = await supabaseAdmin
      .from("knowledge_topics")
      .delete()
      .eq("id", topicId)
      .eq("user_id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting topic:", error);
    return NextResponse.json({ error: "Failed to delete topic" }, { status: 500 });
  }
}
