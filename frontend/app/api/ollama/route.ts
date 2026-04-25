import { NextRequest, NextResponse } from "next/server";

// Allow up to 5 minutes for CPU-only Ollama inference.
export const maxDuration = 300;

/**
 * Proxy route: POST /api/ollama
 *
 * Forwards an OpenAI-compatible chat-completions request to the Ollama daemon
 * running on the host machine.  The container can reach the host via
 * host.docker.internal (mapped by the --add-host runArg in devcontainer.json).
 *
 * The OLLAMA_HOST env var (set in devcontainer.json) is used when available so
 * the same code works in any deployment.
 */
export async function POST(req: NextRequest) {
  const ollamaBase =
    process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://localhost:11434";

  const body = await req.json();

  let upstreamRes: Response;
  try {
    // Allow up to 5 minutes — Ollama on CPU can be very slow.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    upstreamRes = await fetch(`${ollamaBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        stream: false,
        think: false,          // disable <think> chain for deepseek-r1 and similar
        options: {
          temperature: body.temperature ?? 0.3,
          num_predict: 4096,   // enough tokens for all trade rows plus summary
        },
      }),
    });

    clearTimeout(timeout);
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach Ollama at ${ollamaBase}: ${String(err)}` },
      { status: 502 },
    );
  }

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text();
    return NextResponse.json(
      { error: `Ollama error ${upstreamRes.status}: ${text}` },
      { status: upstreamRes.status },
    );
  }

  const rawText = await upstreamRes.text();

  // Ollama with stream:false returns a single JSON object, but some versions
  // still send newline-delimited JSON (one object per line).  Handle both.
  let data: Record<string, unknown>;
  try {
    // Try parsing the whole body as one JSON document first.
    data = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // Fall back to NDJSON: take the last non-empty line (the final chunk).
    const lastLine = rawText.split("\n").filter(Boolean).at(-1) ?? "";
    try {
      data = JSON.parse(lastLine) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: `Could not parse Ollama response: ${rawText.slice(0, 200)}` },
        { status: 502 },
      );
    }
  }

  // Normalise to OpenAI-compatible response shape so the frontend
  // can handle both providers with the same code.
  const msg = data.message as { content?: string; thinking?: string } | undefined;
  // When think:false, content holds the JSON. When thinking is enabled,
  // content may be empty if the model ran out of tokens in the think block.
  const content: string = msg?.content ?? "";
  const done_reason = data.done_reason ?? data.finish_reason ?? "unknown";
  console.log("[ollama proxy] done_reason:", done_reason, "content length:", content.length, "preview:", content.slice(0, 300));
  if (!content) {
    console.error("[ollama proxy] empty content — full raw response:", rawText.slice(0, 1000));
    return NextResponse.json(
      { error: `Ollama returned empty content (done_reason=${done_reason}). Raw: ${rawText.slice(0, 300)}` },
      { status: 502 },
    );
  }
  return NextResponse.json({
    choices: [{ message: { role: "assistant", content } }],
  });
}
