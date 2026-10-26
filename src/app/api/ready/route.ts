import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api/request-guards";
import { getBaseBuddyConfigSetupStatus, isBaseBuddyConfigSetupReady } from "@/lib/basebuddy-config/setup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = enforceRateLimit({ bucket: "api:readiness", request, key: "readiness", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const ready = isBaseBuddyConfigSetupReady(await getBaseBuddyConfigSetupStatus({ checkContentDatabase: true }));
    return NextResponse.json({ ready }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
