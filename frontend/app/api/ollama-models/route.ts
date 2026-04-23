import { NextResponse } from "next/server";

export async function GET() {
  const ollamaBase =
    process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://localhost:11434";

  try {
    const res = await fetch(`${ollamaBase}/api/tags`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ models: [] }, { status: 200 });
    }
    const data = await res.json();
    const models: string[] = (data.models ?? []).map(
      (m: { name: string }) => m.name,
    );
    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({ models: [] }, { status: 200 });
  }
}
