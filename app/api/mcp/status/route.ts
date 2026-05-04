import { NextResponse } from "next/server";
import { getMcpBridgeStatus } from "@/lib/mcp-bridge";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getMcpBridgeStatus());
}
