import { NextResponse } from "next/server";
import {
  fetchCoingeckoSimplePrices,
  sanitizeCoingeckoIds,
  sanitizeVsCurrencies,
} from "@/lib/genius-crypto";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const idsParam = u.searchParams.get("ids") ?? "bitcoin,ethereum";
  const vsParam = u.searchParams.get("vs");
  const ids = sanitizeCoingeckoIds(idsParam);
  const vsParts = vsParam
    ? vsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const vs = sanitizeVsCurrencies(vsParts);
  const body = await fetchCoingeckoSimplePrices(ids, vs);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120",
    },
  });
}
