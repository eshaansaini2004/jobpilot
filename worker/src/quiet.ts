// Quiet hours: collect overnight, send at wake time. Do NOT stop collecting —
// Asian-hours posters (ByteDance/TikTok) fire during the US night.
const TZ = "America/Chicago"; // Eshaan is in Texas; change if that moves
const QUIET_START = 22; // 10pm
const QUIET_END = 6; // 6am

export function hourIn(tz: string, now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).format(now);
  return parseInt(s, 10) % 24;
}

export function isQuietHours(now: Date = new Date()): boolean {
  const h = hourIn(TZ, now);
  return h >= QUIET_START || h < QUIET_END;
}
