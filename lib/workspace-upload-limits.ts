/** Standard-Limit für POST /api/workspace/drop (Medien, Archive, …). */
export const MAX_NEMESIS_DROP_BYTES = 200 * 1024 * 1024;

/** Client-Vorab-Check: nie größer als Server-Obergrenze (s. drop/route NEMESIS_DROP_MAX_MB). */
export const CLIENT_MAX_DROP_BYTES = 500 * 1024 * 1024;
