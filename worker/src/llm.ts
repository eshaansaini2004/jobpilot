import type { Turn } from "./prompt.ts";

// BYO-key LLM config. The key belongs to the user; the app never holds it, it
// lives as a Worker secret. One OpenAI-shaped adapter covers OpenAI, DeepSeek,
// Groq, OpenRouter, Ollama, vLLM, LM Studio. Anthropic needs its own shape.
export interface LlmEnv {
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string; // openai: default https://api.openai.com/v1
  LLM_MODEL?: string;
  LLM_PROVIDER?: string; // "openai" (default) | "anthropic"
  LLM_REVIEW?: string; // "1"/"true" enables the second (reviewer) pass
}

export function reviewEnabled(env: LlmEnv): boolean {
  return env.LLM_REVIEW === "1" || env.LLM_REVIEW === "true";
}

// Free-tier Gemini/OpenAI-shaped backends throw transient 429/503 ("overloaded")
// often enough that one bad roll shouldn't fail a whole tailor. Retry those a few
// times with backoff; pass real errors (4xx auth, bad request) straight through.
async function fetchRetry(url: string, init: RequestInit, f: typeof fetch): Promise<Response> {
  const delays = [1000, 3000, 6000];
  for (let i = 0; ; i++) {
    const res = await f(url, init);
    if (res.ok || (res.status !== 429 && res.status !== 503) || i >= delays.length) return res;
    await new Promise((r) => setTimeout(r, delays[i]));
  }
}

async function callOpenAI(turn: Turn, env: LlmEnv, f: typeof fetch): Promise<string> {
  const base = env.LLM_BASE_URL || "https://api.openai.com/v1";
  const res = await fetchRetry(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.LLM_MODEL || "gpt-4o",
      messages: [
        { role: "system", content: turn.system },
        { role: "user", content: turn.user },
      ],
      temperature: 0.3,
    }),
  }, f);
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j: any = await res.json();
  return j?.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(turn: Turn, env: LlmEnv, f: typeof fetch): Promise<string> {
  const base = env.LLM_BASE_URL || "https://api.anthropic.com";
  const res = await f(`${base.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": env.LLM_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.LLM_MODEL || "claude-sonnet-4-5",
      max_tokens: 4096,
      system: turn.system, // Anthropic: system is top-level, not a message
      messages: [{ role: "user", content: turn.user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j: any = await res.json();
  return j?.content?.[0]?.text ?? "";
}

export function callLlm(turn: Turn, env: LlmEnv, f: typeof fetch = fetch): Promise<string> {
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY not set (owner-gated)");
  return env.LLM_PROVIDER === "anthropic" ? callAnthropic(turn, env, f) : callOpenAI(turn, env, f);
}

// Pull a compilable .tex out of whatever the model returned. Handles markdown
// fences, leading commentary, and trailing chatter. Returns null if there's no
// usable \documentclass..\end{document} span (truncated or junk output).
export function extractTex(raw: string): string | null {
  if (!raw) return null;
  let s = raw.replace(/\r\n/g, "\n");

  // strip ```latex ... ``` or ``` ... ``` fences if present
  const fence = s.match(/```(?:latex|tex)?\n([\s\S]*?)```/);
  if (fence) s = fence[1];

  const start = s.indexOf("\\documentclass");
  if (start < 0) return null;
  s = s.slice(start);

  const end = s.lastIndexOf("\\end{document}");
  if (end < 0) return null; // truncated before the document closed
  return s.slice(0, end + "\\end{document}".length).trim();
}
