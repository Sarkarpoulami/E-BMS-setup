// Central, robust file delivery used by every report/export in the app.
//
// Sandboxed preview frames frequently block the normal paths:
//   - <a download>        blocked without `allow-downloads`
//   - window.open()       blocked without `allow-popups`
//   - blob: in <iframe>   blocked by some sandbox/CSP combinations
// Every helper below therefore reports whether it actually succeeded so the UI
// can fall back instead of failing silently.

export interface DeliveredFile {
  id: string;
  filename: string;
  url: string;
  mime: string;
  size: number;
  createdAt: number;
  blob: Blob;
}

export interface DeliveryOutcome {
  ok: boolean;
  method: 'picker' | 'anchor' | 'window' | 'none';
  verified: boolean; // true when we can prove it worked
  message: string;
}

type Listener = (files: DeliveredFile[]) => void;

const MAX_FILES = 12;
let files: DeliveredFile[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...files];
  listeners.forEach((l) => l(snapshot));
}

export function subscribeDeliveredFiles(listener: Listener): () => void {
  listeners.add(listener);
  listener([...files]);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDeliveredFiles() {
  files.forEach((f) => URL.revokeObjectURL(f.url));
  files = [];
  emit();
}

export function isInsideFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** True when the document is allowed to start downloads (best-effort detection). */
export function downloadsLikelyAllowed(): boolean {
  try {
    const fp = (document as unknown as { featurePolicy?: { allowsFeature(f: string): boolean } }).featurePolicy;
    if (fp && typeof fp.allowsFeature === 'function') return fp.allowsFeature('downloads');
  } catch {
    /* ignore */
  }
  return true;
}

function anchorDownload(url: string, filename: string): boolean {
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // NOTE: no rel="noopener" — Firefox refuses to open blob: URLs with noopener.
    a.style.position = 'fixed';
    a.style.left = '-9999px';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1500);
    return true;
  } catch {
    return false;
  }
}

/** Opens the file in a new tab. Verifiable: a blocked popup returns null. */
export function openFileInTab(file: DeliveredFile): DeliveryOutcome {
  try {
    const w = window.open(file.url, '_blank');
    if (!w) {
      return { ok: false, method: 'window', verified: true, message: 'Pop-up blocked by the browser or preview frame.' };
    }
    try {
      w.opener = null;
    } catch {
      /* ignore */
    }
    return { ok: true, method: 'window', verified: true, message: 'Opened in a new tab.' };
  } catch (e) {
    return { ok: false, method: 'window', verified: true, message: e instanceof Error ? e.message : 'Could not open a new tab.' };
  }
}

/**
 * Saves the file to disk.
 * 1) File System Access API — shows a real save dialog and is fully verifiable.
 * 2) <a download> — standard path, cannot be verified.
 */
export async function saveFile(file: DeliveredFile): Promise<DeliveryOutcome> {
  const picker = (window as unknown as {
    showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }> }>;
  }).showSaveFilePicker;

  if (typeof picker === 'function') {
    try {
      const ext = file.filename.slice(file.filename.lastIndexOf('.'));
      const handle = await picker({
        suggestedName: file.filename,
        types: [{ description: file.mime || 'File', accept: { [file.mime || 'application/octet-stream']: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file.blob);
      await writable.close();
      return { ok: true, method: 'picker', verified: true, message: `Saved ${file.filename}.` };
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === 'AbortError') {
        return { ok: false, method: 'picker', verified: true, message: 'Save cancelled.' };
      }
      // SecurityError / NotAllowedError inside a frame → fall through to the anchor
    }
  }

  const started = anchorDownload(file.url, file.filename);
  if (!started) {
    return { ok: false, method: 'none', verified: true, message: 'The browser refused to start the download.' };
  }
  if (!downloadsLikelyAllowed()) {
    return {
      ok: false,
      method: 'anchor',
      verified: true,
      message: 'Downloads are disabled in this preview frame — use “New tab”, then save from there.',
    };
  }
  return {
    ok: true,
    method: 'anchor',
    verified: false,
    message: 'Download started. If nothing appeared, use Preview or New tab.',
  };
}

export function deliverFile(blob: Blob, filename: string): DeliveredFile {
  const url = URL.createObjectURL(blob);
  const entry: DeliveredFile = {
    id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    url,
    mime: blob.type || 'application/octet-stream',
    size: blob.size,
    createdAt: Date.now(),
    blob,
  };

  files = [entry, ...files];
  if (files.length > MAX_FILES) {
    const evicted = files.slice(MAX_FILES);
    files = files.slice(0, MAX_FILES);
    setTimeout(() => evicted.forEach((f) => URL.revokeObjectURL(f.url)), 60_000);
  }
  emit();

  // Best-effort automatic download; the Download Center is the guaranteed path.
  anchorDownload(url, filename);
  return entry;
}

export function deliverText(content: string, filename: string, mime: string): DeliveredFile {
  return deliverFile(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
