"use client";

import type { AgentProfile } from "@/lib/agent-profile-types";

function BlobBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -left-[20%] top-[-15%] h-[55vmin] w-[55vmin] rounded-full opacity-85 blur-[64px]"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(196, 181, 253, 0.95), rgba(139, 92, 246, 0.45) 45%, transparent 70%)",
        }}
      />
      <div
        className="absolute -right-[15%] top-[10%] h-[50vmin] w-[50vmin] rounded-full opacity-90 blur-[56px]"
        style={{
          background:
            "radial-gradient(circle at 70% 40%, rgba(253, 224, 71, 0.92), rgba(234, 179, 8, 0.5) 50%, transparent 72%)",
        }}
      />
      <div
        className="absolute bottom-[-10%] left-[15%] h-[45vmin] w-[60vmin] rounded-full opacity-75 blur-[72px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(167, 139, 250, 0.55), rgba(250, 204, 21, 0.35) 55%, transparent 75%)",
        }}
      />
      <div className="absolute inset-0 bg-[#0f0a18]/75" />
    </div>
  );
}

export function MobileAgentPicker({
  profiles,
  loading,
  onSelect,
}: {
  profiles: AgentProfile[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const premium = profiles.filter((p) => p.tier === "premium");
  const free = profiles.filter((p) => p.tier === "free");
  const rest = profiles.filter((p) => p.tier !== "premium" && p.tier !== "free");

  const Card = ({ p }: { p: AgentProfile }) => (
    <button
      type="button"
      onClick={() => onSelect(p.id)}
      className="group relative w-full overflow-hidden rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-left shadow-lg backdrop-blur-xl transition active:scale-[0.98] sm:py-4"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100 group-active:opacity-100"
        style={{
          background:
            "linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(253, 224, 71, 0.2))",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold text-white">{p.label}</span>
          {p.tier === "premium" ? (
            <span className="shrink-0 rounded-full bg-amber-300/25 px-2 py-0.5 text-[10px] font-medium text-amber-100 ring-1 ring-amber-200/40">
              Premium
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-medium text-violet-100 ring-1 ring-violet-300/35">
              Free
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-white/75">{p.description}</p>
        <p className="mt-2 truncate font-mono text-[10px] text-amber-200/80">{p.model || "Modell aus .env"}</p>
      </div>
    </button>
  );

  return (
    <div className="relative flex min-h-[100dvh] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <BlobBackdrop />
      <header className="relative mb-6 shrink-0 pt-2">
        <h1 className="bg-gradient-to-r from-violet-200 via-white to-amber-200 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Nemesis Studio
        </h1>
        <p className="mt-1 max-w-md text-[13px] leading-snug text-white/70">
          Wähle einen Agenten — danach öffnet sich der Chat mit Einstellungen und Dateizugriff.
        </p>
      </header>

      {loading ? (
        <p className="relative text-[14px] text-white/60">Agenten werden geladen…</p>
      ) : (
        <div className="relative min-h-0 flex-1 space-y-6 overflow-y-auto pb-8">
          {premium.length ? (
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-200/90">
                Premium
              </h2>
              <div className="space-y-2.5">
                {premium.map((p) => (
                  <Card key={p.id} p={p} />
                ))}
              </div>
            </section>
          ) : null}
          {free.length ? (
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-violet-200/90">
                Free
              </h2>
              <div className="space-y-2.5">
                {free.map((p) => (
                  <Card key={p.id} p={p} />
                ))}
              </div>
            </section>
          ) : null}
          {rest.length ? (
            <section>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                Weitere
              </h2>
              <div className="space-y-2.5">
                {rest.map((p) => (
                  <Card key={p.id} p={p} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
