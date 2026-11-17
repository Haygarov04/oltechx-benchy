/**
 * Is there a newer release on GitHub? The app has no automatic updater (that needs a paid signing
 * certificate on the Mac), so it only tells the user and opens the download page on the site.
 */

export const RELEASES_API = "https://api.github.com/repos/Haygarov04/oltechx-benchy/releases/latest";

/** "v0.16.2" or "0.16.2" → [0, 16, 2]; anything else → null. */
export function parseVersion(text: string | null | undefined): [number, number, number] | null {
  const match = String(text ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True when `latest` is a higher version than `current`. */
export function isNewer(latest: string | null | undefined, current: string | null | undefined) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export type UpdateInfo = { current: string; latest: string } | null;

/** Asks GitHub for the latest release. Any failure (offline, rate limit) simply means "no notice". */
export async function checkForUpdate(current: string, fetchJson: (url: string) => Promise<unknown>): Promise<UpdateInfo> {
  try {
    const release = (await fetchJson(RELEASES_API)) as { tag_name?: string; draft?: boolean; prerelease?: boolean } | null;
    if (!release || release.draft || release.prerelease) return null;
    const latest = String(release.tag_name ?? "").replace(/^v/, "");
    return isNewer(latest, current) ? { current, latest } : null;
  } catch {
    return null;
  }
}
