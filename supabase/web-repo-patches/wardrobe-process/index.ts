import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, requireUser, chargeAiSpend } from "../_shared/ai-router.ts";

const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "accessories"] as const;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

async function processItem(itemId: string, userId: string) {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const fail = async (msg: string) => {
    console.error("wardrobe-process failed:", msg);
    await admin.from("wardrobe_items")
      .update({ processing_status: "failed", processing_error: msg })
      .eq("id", itemId);
  };

  try {
    const { data: item, error: itemErr } = await admin
      .from("wardrobe_items").select("*").eq("id", itemId).maybeSingle();
    if (itemErr || !item) return fail("item not found");
    if (item.user_id !== userId) return fail("forbidden");

    // image_url normally holds a bare object path (userId/uuid.ext — see the
    // mobile client's uploadWardrobeImage). Tolerate legacy rows that stored a
    // full storage URL by extracting the path from it.
    const rawImage = item.image_url as string;
    const m = rawImage.match(/\/storage\/v1\/object\/(?:public|sign)\/wardrobe\/([^?]+)/);
    const path = m ? m[1] : (rawImage.startsWith("http") ? null : rawImage);
    if (!path) return fail("bad image url");
    const { data: signed } = await admin.storage.from("wardrobe").createSignedUrl(path, 60 * 10);
    const imageUrl = signed?.signedUrl;
    if (!imageUrl) return fail("could not sign image");

    // 1) Classify category + name.
    let detectedCategory: string | null = null;
    let detectedName: string | null = null;
    try {
      const cls = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: [
              { type: "text", text: `Identify this clothing item. Return STRICT JSON only: {"category":"<one of: tops|bottoms|dresses|outerwear|shoes|accessories>","name":"<short 2-5 word descriptive name>"}.` },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          }],
        }),
      });
      if (cls.ok) {
        const j = await cls.json();
        const txt: string = j.choices?.[0]?.message?.content || "";
        const match = txt.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if ((CATEGORIES as readonly string[]).includes(parsed.category)) detectedCategory = parsed.category;
          if (typeof parsed.name === "string") detectedName = parsed.name.slice(0, 80);
        }
      } else {
        console.warn("classify status", cls.status, await cls.text());
      }
    } catch (e) { console.error("classify failed", e); }

    // 2) Background removal via image model.
    let cleanedPath: string | null = null;
    try {
      const bg = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          modalities: ["image", "text"],
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Remove the background from this clothing item completely. Return ONLY the garment isolated on a fully transparent background. Keep the garment crisp, centered, and unaltered in color or shape." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          }],
        }),
      });
      if (bg.ok) {
        const j = await bg.json();
        const dataUrl: string | undefined = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (dataUrl?.startsWith("data:")) {
          const [meta, b64] = dataUrl.split(",");
          const mime = /data:([^;]+);/.exec(meta)?.[1] || "image/png";
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const newPath = `${userId}/${crypto.randomUUID()}.png`;
          const { error: upErr } = await admin.storage.from("wardrobe")
            .upload(newPath, bytes, { contentType: mime, upsert: false });
          if (!upErr) {
            // Store the OBJECT PATH (userId/uuid.png), NOT a public URL: the
            // wardrobe bucket is private, so clients sign paths on demand
            // (mobile src/lib/storage.ts signWardrobeUrl). This matches how
            // uploadWardrobeImage stores paths — no bucket prefix.
            cleanedPath = newPath;
            await admin.storage.from("wardrobe").remove([path]);
          } else {
            console.warn("upload cleaned failed", upErr);
          }
        } else {
          console.warn("no image returned from bg removal");
        }
      } else {
        console.warn("bg removal status", bg.status, await bg.text());
      }
    } catch (e) { console.error("bg removal failed", e); }

    // 3) Update the row.
    const updates: Record<string, unknown> = { processing_status: "completed", processing_error: null };
    if (cleanedPath) updates.image_url = cleanedPath;
    if (detectedCategory) updates.category = detectedCategory;
    if (detectedName && !item.name) updates.name = detectedName;
    await admin.from("wardrobe_items").update(updates).eq("id", itemId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "unknown error");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const userId = auth.user.id;
    const capped = await chargeAiSpend(userId, "wardrobe-process", req);
    if (capped) return capped;

    const { itemId } = await req.json();
    if (!itemId) return jsonResponse({ error: "missing itemId" }, 400);
    if (!Deno.env.get("LOVABLE_API_KEY")) return jsonResponse({ error: "ai not configured" }, 500);

    // Mark as processing immediately so the client can poll.
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    await admin.from("wardrobe_items")
      .update({ processing_status: "processing", processing_error: null })
      .eq("id", itemId).eq("user_id", userId);

    // Run AI work in the background so we don't hit the request timeout.
    const work = processItem(itemId, userId);
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(work);
    } else {
      // Fallback: fire and forget.
      work.catch((e) => console.error(e));
    }
    return jsonResponse({ ok: true, status: "processing", itemId }, 202);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});