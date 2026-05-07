"use client";

/** Erste Paint-Phase: verhindert Desktop-Panels auf dem Handy + Hydration-Mismatch beim Layout-Bruch */
export function StudioBootScreen() {
  return (
    <div className="nemesis-fun-bg flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
      <div className="rounded-3xl border border-[#a855f7]/30 bg-[#fff7cc]/90 px-10 py-8 shadow-xl backdrop-blur-md">
        <h1 className="bg-gradient-to-r from-[#7c3aed] via-[#ec4899] to-[#7c3aed] bg-clip-text text-2xl font-bold tracking-tight text-transparent">
          Nemesis Studio
        </h1>
        <div
          className="mx-auto mt-5 h-9 w-9 animate-spin rounded-full border-2 border-[#a855f7] border-t-transparent"
          aria-hidden
        />
        <p className="mt-4 text-[14px] leading-snug text-[#7c3aed]">
          Oberfläche wird geladen…
          <span className="mt-2 block text-[12px] text-[#db2777]/90">
            Bitte einen Moment — besonders beim ersten Aufruf.
          </span>
        </p>
      </div>
    </div>
  );
}
