import { NextResponse } from "next/server";
import { getAgentProfiles } from "@/lib/agent-profiles";

export const runtime = "nodejs";

/** Öffentliche Liste der Agenten (aus config/agents.json oder Fallback). */
export async function GET() {
  const { profiles, defaultAgentId, source, pathUsed } = await getAgentProfiles();
  return NextResponse.json({
    agents: profiles,
    defaultAgentId,
    source,
    configPath: pathUsed,
  });
}
