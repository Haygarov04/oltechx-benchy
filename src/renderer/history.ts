import type { CheckResults, Uploaded } from "../shared/types";

/**
 * Past checks, kept on this device so a finished check is not lost when the app is closed:
 * the results can be opened again, uploaded later or turned into a listing. Only the newest few are kept.
 */
export type SavedUpload = Uploaded & { passed?: boolean; problems?: string[] };
export type SavedCheck = { id: string; at: number; device: string | null; results: CheckResults; uploaded: SavedUpload | null };

const KEY = "olx.history";
const MAX = 15;

export function loadHistory(): SavedCheck[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as SavedCheck[];
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === "string" && c.results) : [];
  } catch {
    return [];
  }
}

function store(list: SavedCheck[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Storage full or blocked: the check still works, it is just not remembered.
  }
}

export function addCheck(check: SavedCheck): SavedCheck[] {
  const list = [check, ...loadHistory().filter((c) => c.id !== check.id)].slice(0, MAX);
  store(list);
  return list;
}

export function markUploaded(id: string, uploaded: SavedUpload): SavedCheck[] {
  const list = loadHistory().map((c) => (c.id === id ? { ...c, uploaded } : c));
  store(list);
  return list;
}

export function removeCheck(id: string): SavedCheck[] {
  const list = loadHistory().filter((c) => c.id !== id);
  store(list);
  return list;
}
