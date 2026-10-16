import { useEffect, useRef, useState } from 'react';
import {
  Download,
  X,
  FileJson,
  FileText,
  FileSpreadsheet,
  ExternalLink,
  Eye,
  Copy,
  Check,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import {
  DeliveredFile,
  DeliveryOutcome,
  subscribeDeliveredFiles,
  clearDeliveredFiles,
  isInsideFrame,
  downloadsLikelyAllowed,
  saveFile,
  openFileInTab,
  formatBytes,
} from '../utils/fileDelivery';

function iconFor(f: DeliveredFile) {
  if (f.filename.endsWith('.pdf')) return <FileText className="w-4 h-4 text-rose-400" />;
  if (f.filename.endsWith('.csv')) return <FileSpreadsheet className="w-4 h-4 text-amber-400" />;
  return <FileJson className="w-4 h-4 text-emerald-400" />;
}

export function DownloadCenter() {
  const [files, setFiles] = useState<DeliveredFile[]>([]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeliveredFile | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfTimedOut, setPdfTimedOut] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const lastTop = useRef<string | null>(null);
  const framed = isInsideFrame();
  const dlBlocked = !downloadsLikelyAllowed();

  useEffect(
    () =>
      subscribeDeliveredFiles((list) => {
        setFiles(list);
        const top = list[0]?.id ?? null;
        if (top && top !== lastTop.current) {
          setOpen(true);
          setStatus(null);
        }
        lastTop.current = top;
      }),
    []
  );

  // Load text content for non-PDF previews
  useEffect(() => {
    setPdfLoaded(false);
    setPdfTimedOut(false);
    if (!preview) {
      setPreviewText('');
      return;
    }
    if (preview.filename.endsWith('.pdf')) {
      const t = setTimeout(() => setPdfTimedOut(true), 2500);
      return () => clearTimeout(t);
    }
    let alive = true;
    preview.blob.text().then((t) => {
      if (alive) setPreviewText(t.length > 300_000 ? `${t.slice(0, 300_000)}\n\n… truncated in preview — the saved file is complete.` : t);
    });
    return () => {
      alive = false;
    };
  }, [preview]);

  const report = (o: DeliveryOutcome) => setStatus({ ok: o.ok, text: o.message });

  const doSave = async (f: DeliveredFile) => {
    setBusyId(f.id);
    setStatus(null);
    try {
      report(await saveFile(f));
    } finally {
      setBusyId(null);
    }
  };

  const doOpen = (f: DeliveredFile) => {
    const outcome = openFileInTab(f);
    report(outcome);
    if (!outcome.ok) setPreview(f); // fall back to the in-app viewer
  };

  const doCopy = async (f: DeliveredFile) => {
    try {
      await navigator.clipboard.writeText(await f.blob.text());
      setCopiedId(f.id);
      setStatus({ ok: true, text: 'File contents copied to the clipboard.' });
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setPreview(f);
      setStatus({ ok: false, text: 'Clipboard blocked — select the text in the preview instead.' });
    }
  };

  if (files.length === 0) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-[60] w-[380px] max-w-[calc(100vw-2rem)]">
        <div className="bg-slate-950/97 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 backdrop-blur-md overflow-hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-900 border-b border-slate-800 cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-white">
              <Download className="w-4 h-4 text-cyan-400" />
              Download center
              <span className="px-1.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-mono">{files.length}</span>
            </span>
            {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
          </button>

          {open && (
            <div>
              {(framed || dlBlocked) && (
                <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                  <div>
                    This preview frame can block file downloads.{' '}
                    <a href={window.location.href} target="_blank" rel="noreferrer" className="underline font-bold">
                      Open the app in a new tab
                    </a>{' '}
                    for normal saving, or use <b>Preview</b> to read the file here.
                  </div>
                </div>
              )}

              {status && (
                <div
                  className={`px-3 py-2 text-[11px] font-mono border-b flex items-start gap-2 ${
                    status.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`}
                >
                  {status.ok ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  <span>{status.text}</span>
                </div>
              )}

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800">
                {files.map((f) => (
                  <div key={f.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {iconFor(f)}
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-mono text-slate-100 truncate" title={f.filename}>
                          {f.filename}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {formatBytes(f.size)} · {new Date(f.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      <button
                        onClick={() => doSave(f)}
                        disabled={busyId === f.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-600 text-white text-[10px] font-bold hover:bg-cyan-500 cursor-pointer disabled:opacity-60"
                      >
                        {busyId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} Save
                      </button>
                      <button
                        onClick={() => setPreview(f)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold hover:bg-slate-700 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" /> Preview
                      </button>
                      <button
                        onClick={() => doOpen(f)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold hover:bg-slate-700 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" /> New tab
                      </button>
                      {!f.filename.endsWith('.pdf') && (
                        <button
                          onClick={() => doCopy(f)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold hover:bg-slate-700 cursor-pointer"
                        >
                          {copiedId === f.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedId === f.id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-3 py-2 border-t border-slate-800 flex justify-end">
                <button onClick={clearDeliveredFiles} className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-rose-400 cursor-pointer">
                  <Trash2 className="w-3 h-3" /> Clear list
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2 min-w-0">
                {iconFor(preview)}
                <span className="text-xs font-mono text-white truncate">{preview.filename}</span>
                <span className="text-[10px] font-mono text-slate-500 shrink-0">{formatBytes(preview.size)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => doSave(preview)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-600 text-white text-[11px] font-bold cursor-pointer">
                  <Download className="w-3.5 h-3.5" /> Save
                </button>
                <button onClick={() => doOpen(preview)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 text-slate-200 text-[11px] font-bold cursor-pointer">
                  <ExternalLink className="w-3.5 h-3.5" /> New tab
                </button>
                <button onClick={() => setPreview(null)} className="p-1.5 rounded-md bg-slate-800 text-slate-300 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-slate-950 relative">
              {preview.filename.endsWith('.pdf') ? (
                <>
                  <iframe
                    title={preview.filename}
                    src={preview.url}
                    className="w-full h-full bg-white"
                    onLoad={() => setPdfLoaded(true)}
                  />
                  {!pdfLoaded && pdfTimedOut && (
                    <div className="absolute inset-0 bg-slate-950 flex items-center justify-center p-6 text-center">
                      <div className="max-w-md">
                        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                        <h3 className="text-sm font-bold text-white">This frame won't display PDFs</h3>
                        <p className="text-xs text-slate-400 mt-2">
                          The PDF was generated correctly ({formatBytes(preview.size)}). The embedded viewer is blocked here.
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <button onClick={() => doSave(preview)} className="px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold cursor-pointer">
                            Save to disk
                          </button>
                          <a href={window.location.href} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-200 text-xs font-bold">
                            Open app in new tab
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <pre className="w-full h-full overflow-auto p-4 text-[11px] leading-relaxed font-mono text-slate-200 whitespace-pre select-text">
                  {previewText || 'Loading…'}
                </pre>
              )}
            </div>

            {status && (
              <div className={`px-4 py-2 text-[11px] font-mono border-t ${status.ok ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>
                {status.text}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
