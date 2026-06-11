import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { createServiceClient, getChatUserFromRequest } from "~/lib/chat-auth.server";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export async function action({ request }: ActionFunctionArgs) {
  const user = await getChatUserFromRequest(request);
  if (!user) {
    return json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return json({ error: "file is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: "Invalid file type" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const messageType = file.type === "image/gif" ? "gif" : "image";
  const filename = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const supabase = createServiceClient();

  const { error: uploadError } = await supabase.storage
    .from("chat-media")
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("chat-media")
    .getPublicUrl(filename);

  return json({
    url: urlData.publicUrl,
    messageType,
    metadata: { filename: file.name, size: file.size, type: file.type },
  });
}
