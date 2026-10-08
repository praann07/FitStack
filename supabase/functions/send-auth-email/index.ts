import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

type Kind = "welcome" | "login"

const CONTENT: Record<Kind, { subject: string; html: string }> = {
  welcome: {
    subject: "Welcome to FitStack",
    html: "<p>Your FitStack account is ready. Glad to have you.</p>",
  },
  login: {
    subject: "New sign-in to your FitStack account",
    html: `<p>We noticed a new sign-in to your FitStack account just now.</p><p>If this wasn't you, change your password.</p>`,
  },
}

// supabase.functions.invoke() always sends a CORS preflight from the
// browser; without these headers the browser blocks the response before
// authService.ts ever sees it, regardless of what the function returns.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) {
    return json({ error: "Missing authorization" }, 401)
  }

  let kind: Kind
  try {
    const body = await req.json()
    if (body.kind !== "welcome" && body.kind !== "login") {
      return json({ error: "Invalid kind" }, 400)
    }
    kind = body.kind
  } catch {
    return json({ error: "Invalid body" }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const jwt = authHeader.replace("Bearer ", "")
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
  if (userError || !userData.user?.email) {
    return json({ error: "Unauthorized" }, 401)
  }

  const { subject, html } = CONTENT[kind]
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FitStack <hello@weighsfit.in>",
      to: [userData.user.email],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    console.error("Resend send failed", res.status, await res.text())
    return json({ error: "send failed" }, 502)
  }

  return json({ ok: true })
})
