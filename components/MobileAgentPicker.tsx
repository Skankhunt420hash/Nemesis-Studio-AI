"use client";

import type { AgentProfile } from "@/lib/agent-profile-types";

function BlobBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="nemesis-parallax-soft absolute -left-[20%] top-[-15%] h-[55vmin] w-[55vmin] rounded-full opacity-85 blur-[64px]"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(196, 181, 253, 0.95), rgba(139, 92, 246, 0.45) 45%, transparent 70%)",
        }}
      />
      <div
        className="nemesis-parallax-soft absolute -right-[15%] top-[10%] h-[50vmin] w-[50vmin] rounded-full opacity-90 blur-[56px]"
        style={{
          background:
            "radial-gradient(circle at 70% 40%, rgba(253, 224, 71, 0.92), rgba(234, 179, 8, 0.5) 50%, transparent 72%)",
        }}
      />
      <div
        className="nemesis-parallax-soft absolute bottom-[-10%] left-[15%] h-[45vmin] w-[60vmin] rounded-full opacity-75 blur-[72px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(167, 139, 250, 0.55), rgba(250, 204, 21, 0.35) 55%, transparent 75%)",
        }}
      />
      <div className="absolute inset-0 bg-[#ffe45e]/70" />
      <div className="nemesis-float-layer nemesis-parallax-soft">
        <span className="nemesis-float-bubble left-[8%] top-[12%] h-10 w-10 [--dur:6.2s]" />
        <span className="nemesis-float-bubble left-[18%] top-[62%] h-6 w-6 [--dur:7.1s]" />
        <span className="nemesis-float-bubble left-[42%] top-[18%] h-8 w-8 [--dur:6.8s]" />
        <span className="nemesis-float-bubble left-[56%] top-[74%] h-7 w-7 [--dur:7.6s]" />
        <span className="nemesis-float-bubble left-[74%] top-[26%] h-11 w-11 [--dur:6.5s]" />
        <span className="nemesis-float-bubble left-[84%] top-[66%] h-5 w-5 [--dur:8.1s]" />
      </div>
    </div>
  );
}

export function MobileAgentPicker({
  profiles,
  loading,
  fetchError,
  onRetryFetch,
  onSelect,
}: {
  profiles: AgentProfile[];
  loading: boolean;
  /** z. B. wenn /api/agents nicht erreichbar ist */
  fetchError?: string | null;
  onRetryFetch?: () => void;
  onSelect: (id: string) => void;
}) {
  const premium = profiles.filter((p) => p.tier === "premium");
  const free = profiles.filter((p) => p.tier === "free");
  const rest = profiles.filter((p) => p.tier !== "premium" && p.tier !== "free");

  const Card = ({ p }: { p: AgentProfile }) => (
    <button
      type="button"
      onClick={() => onSelect(p.id)}
      className="nemesis-bubble-btn group relative w-full overflow-hidden rounded-2xl border border-[#a855f7]/35 bg-[#fff7cc]/85 px-4 py-3.5 text-left shadow-lg backdrop-blur-xl transition active:scale-[0.98] sm:py-4"
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
          <span className="text-[15px] font-semibold text-[#7c3aed]">{p.label}</span>
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
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#db2777]">{p.description}</p>
        <p className="mt-2 truncate font-mono text-[10px] text-[#7c3aed]">{p.model || "Modell aus .env"}</p>
      </div>
    </button>
  );

  return (
    <div className="nemesis-fun-bg relative flex min-h-[100dvh] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
      <BlobBackdrop />
      <header className="relative mb-6 shrink-0 pt-2">
        <h1 className="bg-gradient-to-r from-[#7c3aed] via-[#ec4899] to-[#7c3aed] bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Nemesis Studio
        </h1>
        <p className="mt-1 max-w-md text-[13px] leading-snug text-[#7c3aed]">
          Wähle einen Agenten — danach öffnet sich der Chat mit Einstellungen und Dateizugriff.
        </p>
      </header>

      {fetchError ? (
        <div className="relative space-y-3 rounded-2xl border border-red-400/35 bg-[#fff7cc]/95 p-4 text-left shadow-inner">
          <p className="text-[13px] font-semibold text-red-800">Agenten konnten nicht geladen werden</p>
          <p className="text-[12px] leading-snug text-red-900/90">{fetchError}</p>
          {onRetryFetch ? (
            <button
              type="button"
              className="nemesis-bubble-btn w-full rounded-xl border border-[#a855f7]/35 bg-[#ede9fe] px-4 py-2.5 text-[13px] font-medium text-[#5b21b6]"
              onClick={onRetryFetch}
            >
              Erneut versuchen
            </button>
          ) : null}
        </div>
      ) : loading ? (
        <p className="relative text-[14px] text-[#7c3aed]">Agenten werden geladen…</p>
      ) : premium.length === 0 && free.length === 0 && rest.length === 0 ? (
        <div className="relative space-y-3 rounded-2xl border border-[#a855f7]/35 bg-[#fff7cc]/95 p-4 text-left">
          <p className="text-[13px] font-semibold text-[#7c3aed]">Keine Agenten verfügbar</p>
          <p className="text-[12px] leading-snug text-[#db2777]">
            Die Liste von <span className="font-mono">/api/agents</span> war leer. Prüfe die
            Bereitstellung (Build, Server-Logs) oder lade die Seite neu.
          </p>
          {onRetryFetch ? (
            <button
              type="button"
              className="nemesis-bubble-btn w-full rounded-xl border border-[#a855f7]/35 bg-[#ede9fe] px-4 py-2.5 text-[13px] font-medium text-[#5b21b6]"
              onClick={onRetryFetch}
            >
              Neu laden
            </button>
          ) : null}
        </div>
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
