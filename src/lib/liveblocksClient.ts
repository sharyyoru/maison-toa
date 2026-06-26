"use client";

import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";
import { supabaseClient } from "@/lib/supabaseClient";

type ConsultationPresence = {
  name: string;
  email: string | null;
};

export const liveblocksClient = createClient({
  authEndpoint: async (room) => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    const response = await fetch("/api/liveblocks-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {}),
      },
      body: JSON.stringify({ room }),
    });

    return response.json();
  },
});

export const {
  RoomProvider: ConsultationRoomProvider,
  useOthers: useConsultationOthers,
  useRoom: useConsultationRoom,
  useSelf: useConsultationSelf,
  useUpdateMyPresence: useUpdateConsultationPresence,
} = createRoomContext<ConsultationPresence>(liveblocksClient);
