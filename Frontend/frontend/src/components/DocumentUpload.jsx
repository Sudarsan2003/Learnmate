import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, Trash2, RefreshCw, X, CheckCircle2, AlertCircle, Loader2, Feather, Check, Folder, Layers } from "lucide-react";


const STATUS = {
  QUEUED: "queued",
  UPLOADING: "uploading",
  PROCESSING: "processing", // uploaded; the server is reading and embedding it
  DONE: "done",
  ERROR: "error",
};

// Must match spring.servlet.multipart.max-file-size on the server.
const MAX_UPLOAD_MB = 200;
const POLL_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function readError(res) {
  if (res.status === 413) return `This file is too big. Files can be up to ${MAX_UPLOAD_MB} MB.`;
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    if (body?.message || body?.error) return body.message || body.error;
  } catch {
    // not JSON
  }
  return text || `${res.status} ${res.statusText}`;
}

export default function DocumentUpload({
    token,
    role,
    apiBase = `${import.meta.env.VITE_API_BASE_URL}/api/documents`
}){
  const [documents, setDocuments] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const isAdmin = role === "ADMIN";

  // Admins upload on behalf of any school and must pick one explicitly —
  // there's no "their own institution" to default to. Teachers never see
  // this; they're always scoped server-side to their own account's school.
  const [institution, setInstitution] = useState("");
  const [institutions, setInstitutions] = useState([]);
  const [institutionsLoading, setInstitutionsLoading] = useState(isAdmin);
  const [isCreatingInstitution, setIsCreatingInstitution] = useState(false);
  const [newInstitutionName, setNewInstitutionName] = useState("");

  const [subject, setSubject] = useState("");
  const [standard, setStandard] = useState("");
  const [queue, setQueue] = useState([]); // { id, file, status, error }
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Admins can browse one school/folder at a time (the default, same as
  // teachers) or flip to "all documents" to audit/clean up the entire
  // knowledge base across every institution and standard in one list.
  // Irrelevant for teachers — they're always scoped to their own school.
  const [viewMode, setViewMode] = useState("folder"); // "folder" | "all"

  // "Folders" are just distinct `standard` values that already have material
  // for this school. We fetch the existing ones so admins/teachers pick from
  // a list instead of retyping — retyping is how "5", "Grade 5", and "5th"
  // end up as three different folders that can't see each other's docs.
  const [standards, setStandards] = useState([]);
  const [standardsLoading, setStandardsLoading] = useState(true);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const fileInputRef = useRef(null);
  const dragCounter = useRef(0);

  const authHeaders = useCallback(
    (extra = {}) => ({
      Authorization: `Bearer ${token}`,
      ...extra,
    }),
    [token]
  );

  const loadDocuments = useCallback(async () => {
    // Admin "all documents" view ignores the folder/institution pickers
    // entirely — it's meant to show literally everything in one place.
    if (isAdmin && viewMode === "all") {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch(`${apiBase}/all`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = await res.json();
        setDocuments(Array.isArray(data) ? data : data.documents ?? []);
      } catch (err) {
        setListError(err.message || "Could not load the document list.");
      } finally {
        setListLoading(false);
      }
      return;
    }

    if (!standard.trim() || (isAdmin && !institution.trim())) {
      setDocuments([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ standard: standard.trim() });
      if (isAdmin && institution.trim()) params.set("institution", institution.trim());
      const res = await fetch(`${apiBase}?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : data.documents ?? []);
    } catch (err) {
      setListError(err.message || "Could not load the document list.");
    } finally {
      setListLoading(false);
    }
  }, [apiBase, authHeaders, standard, isAdmin, institution, viewMode]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const loadStandards = useCallback(async () => {
    if (isAdmin && !institution.trim()) {
      setStandards([]);
      setStandardsLoading(false);
      return;
    }
    setStandardsLoading(true);
    try {
      const qs = isAdmin ? `?institution=${encodeURIComponent(institution.trim())}` : "";
      const res = await fetch(`${apiBase}/standards${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setStandards(Array.isArray(data) ? data : []);
    } catch {
      setStandards([]);
    } finally {
      setStandardsLoading(false);
    }
  }, [apiBase, authHeaders, isAdmin, institution]);

  useEffect(() => {
    loadStandards();
  }, [loadStandards]);

  // Institutions come from existing user accounts (schools onboard by having
  // a user registered under that institution name) — this powers the admin
  // picker the same way /standards powers the folder picker.
  const loadInstitutions = useCallback(async () => {
    if (!isAdmin) return;
    setInstitutionsLoading(true);
    try {
      const adminBase = apiBase.replace(/\/documents$/, "");
      const res = await fetch(`${adminBase}/admin/institutions`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      // /api/admin/institutions returns objects like
      // { institution, userCount, users }, not plain strings — pull the
      // name out (falling back to the raw value in case it's ever a plain
      // string array instead).
      const names = Array.isArray(data)
        ? data
            .map((item) => (typeof item === "string" ? item : item?.institution))
            .filter((name) => typeof name === "string" && name.trim().length > 0)
        : [];
      setInstitutions(names);
    } catch {
      setInstitutions([]);
    } finally {
      setInstitutionsLoading(false);
    }
  }, [apiBase, authHeaders, isAdmin]);

  useEffect(() => {
    loadInstitutions();
  }, [loadInstitutions]);

  const handleSelectInstitution = (value) => {
    if (value === "__create_new__") {
      setIsCreatingInstitution(true);
      setNewInstitutionName("");
      return;
    }
    setInstitution(value);
    setStandard(""); // folders are institution-scoped — force re-pick
  };

  const handleConfirmNewInstitution = () => {
    const trimmed = newInstitutionName.trim();
    if (!trimmed) return;
    setInstitutions((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed].sort()));
    setInstitution(trimmed);
    setStandard("");
    setIsCreatingInstitution(false);
    setNewInstitutionName("");
  };

  const handleCancelNewInstitution = () => {
    setIsCreatingInstitution(false);
    setNewInstitutionName("");
  };

  const handleSelectFolder = (value) => {
    if (value === "__create_new__") {
      setIsCreatingFolder(true);
      setNewFolderName("");
      return;
    }
    setStandard(value);
  };

  const handleConfirmNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    // Optimistically add it to the folder list so it's there immediately —
    // it becomes a "real" folder as soon as the first document is uploaded
    // into it and shows up for everyone on the next /standards refresh.
    setStandards((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed].sort()));
    setStandard(trimmed);
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  const handleCancelNewFolder = () => {
    setIsCreatingFolder(false);
    setNewFolderName("");
  };

  const canUpload = standard.trim() && (!isAdmin || institution.trim());

  const addFilesToQueue = (fileList) => {
    if (!canUpload) return;
    const accepted = [".pdf", ".docx", ".pptx"];
    const items = Array.from(fileList)
      .filter((f) => accepted.some((ext) => f.name.toLowerCase().endsWith(ext)))
      .map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        status: STATUS.QUEUED,
        error: null,
      }));
    if (items.length) setQueue((q) => [...q, ...items]);
  };

  const uploadOne = async (item) => {
    if (!canUpload) {
      setQueue((q) =>
        q.map((i) =>
          i.id === item.id
            ? { ...i, status: STATUS.ERROR, error: isAdmin && !institution.trim()
                ? "Select an institution before uploading."
                : "Set a standard before uploading." }
            : i
        )
      );
      return;
    }

    const update = (patch) => setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));

    if (item.file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      update({ status: STATUS.ERROR, error: `This file is ${fileSize(item.file.size)}. Files can be up to ${MAX_UPLOAD_MB} MB.` });
      return;
    }

    update({ status: STATUS.UPLOADING, error: null, note: null });

    const formData = new FormData();
    formData.append("file", item.file);
    if (subject.trim()) formData.append("subject", subject.trim());
    formData.append("standard", standard.trim());
    if (isAdmin) formData.append("institution", institution.trim());

    try {
      const res = await fetch(apiBase + "/upload", {
        method: "POST",
        headers: authHeaders(), // no Content-Type — browser sets multipart boundary
        body: formData,
      });
      if (!res.ok) throw new Error(await readError(res));
      const { sourceId } = await res.json();

      // The server reads and embeds the file in the background (a whole
      // textbook can take a few minutes), so poll until it's finished.
      update({ status: STATUS.PROCESSING, note: "Processing…" });
      for (;;) {
        await sleep(POLL_MS);
        let st;
        try {
          const r = await fetch(`${apiBase}/status/${encodeURIComponent(sourceId)}`, { headers: authHeaders() });
          if (!r.ok) continue; // a blip; try again
          st = await r.json();
        } catch {
          continue;
        }
        if (st.status === "FAILED") throw new Error(st.message || "Processing failed.");
        if (st.status === "DONE") {
          update({ status: STATUS.DONE, note: st.chunkCount ? `${st.chunkCount} sections` : null });
          break;
        }
        if (st.status === "UNKNOWN") {
          // The server restarted mid-way and lost track of this file.
          throw new Error("Processing was interrupted. Please upload the file again.");
        }
        if (st.message) update({ note: st.message });
      }
      loadDocuments();
      loadStandards();
    } catch (err) {
      setQueue((q) =>
        q.map((i) =>
          i.id === item.id ? { ...i, status: STATUS.ERROR, error: err.message || "Upload failed." } : i
        )
      );
    }
  };

  const uploadAllQueued = () => {
    queue.filter((i) => i.status === STATUS.QUEUED).forEach(uploadOne);
  };

  const removeFromQueue = (id) => setQueue((q) => q.filter((i) => i.id !== id));
  const clearFinished = () =>
    setQueue((q) => q.filter((i) => i.status !== STATUS.DONE && i.status !== STATUS.ERROR));

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setDocuments((docs) => docs.filter((d) => d.id !== id));
    } catch (err) {
      setListError(err.message || "Could not remove that document.");
    } finally {
      setDeletingId(null);
    }
  };


  const onDrop = (e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFilesToQueue(e.dataTransfer.files);
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setIsDragging(false);
  };

  const formatDate = (iso) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return iso;
    }
  };

  const queuedCount = queue.filter((i) => i.status === STATUS.QUEUED).length;
  const hasFinished = queue.some((i) => i.status === STATUS.DONE || i.status === STATUS.ERROR);
  // In "all documents" mode rows span every school/folder, so institution,
  // standard, and owner columns are needed to tell them apart — in the
  // normal single-folder view they'd all just repeat the same value.
  const showScopeColumns = isAdmin && viewMode === "all";

  return (
    <div className="doc-upload min-h-full bg-[var(--bg)] px-4 py-6 text-[var(--text)] sm:px-8 sm:py-8" style={{ perspective: "1400px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lexend:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

        .doc-upload {
          font-family: 'Inter', var(--font-ui), -apple-system, sans-serif;
          font-size: 14px;
          -webkit-font-smoothing: antialiased;
        }
        .doc-upload .page-title {
          font-family: 'Lexend', 'Inter', var(--font-ui), sans-serif;
          font-weight: 600;
          letter-spacing: -0.01em;
        }
        .doc-upload .section-title {
          font-family: 'Lexend', 'Inter', var(--font-ui), sans-serif;
          font-weight: 600;
          letter-spacing: -0.005em;
        }
        .doc-upload .page-sub {
          font-weight: 400;
          color: var(--muted);
        }
        .doc-upload .role-pill {
          font-family: 'Inter', var(--font-ui), sans-serif;
          font-weight: 500;
          font-size: 12px;
        }
        .doc-upload label {
          font-weight: 600;
        }
        .doc-upload button {
          font-family: 'Inter', var(--font-ui), sans-serif;
        }
        .doc-upload table {
          font-variant-numeric: tabular-nums;
        }
        .doc-upload th {
          font-weight: 600;
          font-size: 12px;
        }

        .lm-row { transition: background 140ms ease, transform 140ms ease; transform-style: preserve-3d; }
        .lm-row:hover { background: rgba(79,124,255,0.07); transform: translateZ(4px); }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: var(--dim); border-radius: 4px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes queue-in {
          from { opacity: 0; transform: translateY(-6px) rotateX(-10deg); }
          to { opacity: 1; transform: translateY(0) rotateX(0deg); }
        }
        @keyframes drop-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(79,124,255,0.3); }
          50% { box-shadow: 0 0 0 10px rgba(79,124,255,0); }
        }
      `}</style>

      <div className="mx-auto max-w-[920px]" style={{ transformStyle: "preserve-3d" }}>
        {/* Header */}
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="page-title">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F80F8] to-[#24389E] shadow-[0_4px_14px_-3px_rgba(53,88,222,0.6)] ring-1 ring-white/10">
                <Feather size={16} strokeWidth={2} className="text-[#FFFFFF]" />
              </span>
              Document ingestion
              <span className="role-pill">{role === "TEACHER" ? "Teacher" : "Admin"}</span>
            </h1>
            <p className="page-sub">
              Upload subject material for the knowledge base. It's parsed, chunked and embedded automatically.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2 self-start">
            <button
              onClick={loadDocuments}
              className="group flex items-center gap-1.5 rounded-full border border-[#4F7CFF]/20 bg-[var(--surface)]/60 px-3.5 py-2 text-[13px] font-medium text-[var(--muted)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#4F7CFF]/40 hover:bg-[#4F7CFF]/10 hover:text-[var(--text)] hover:shadow-md active:translate-y-0"
            >
              <RefreshCw size={13} strokeWidth={2.25} className="transition-transform duration-500 group-hover:rotate-180" />
              Refresh
            </button>
          </div>
        </div>

        {/* Institution picker — admin only. Admins upload on behalf of any
            school and must say which one explicitly; teachers never see
            this, they're always scoped server-side to their own account's
            institution. Folder options below are scoped to whichever
            institution is picked here. */}
        {isAdmin && (
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
              Institution <span className="ml-1 text-[12px] font-normal text-[var(--dim)]">Required. Which school this upload belongs to.</span>
            </label>

            {isCreatingInstitution ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newInstitutionName}
                  onChange={(e) => setNewInstitutionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleConfirmNewInstitution(); }
                    if (e.key === "Escape") handleCancelNewInstitution();
                  }}
                  placeholder='New institution name, e.g. "SRV"'
                  className="min-w-0 flex-1 rounded-md border border-[#3558DE]/40 bg-[var(--surface)]/70 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-shadow focus:border-[#3558DE]/60 focus:shadow-[0_0_0_3px_rgba(53,88,222,0.15)]"
                />
                <button
                  type="button"
                  onClick={handleConfirmNewInstitution}
                  disabled={!newInstitutionName.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-3.5 py-2 text-[13px] font-semibold text-[#FFFFFF] shadow-[0_4px_12px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_rgba(53,88,222,0.65)] disabled:translate-y-0 disabled:opacity-30 disabled:shadow-none"
                >
                  <Check size={14} strokeWidth={2.5} />
                  Create
                </button>
                <button
                  type="button"
                  onClick={handleCancelNewInstitution}
                  className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/15 bg-transparent px-3 py-2 text-[13px] text-[var(--muted)] transition-all hover:border-[#4F7CFF]/30 hover:bg-[var(--surface)]/60 hover:text-[var(--text)]"
                >
                  <X size={13} strokeWidth={2.25} />
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={institution}
                onChange={(e) => handleSelectInstitution(e.target.value)}
                disabled={institutionsLoading}
                className="w-full rounded-md border border-[#4F7CFF]/15 bg-[var(--surface)]/70 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-shadow focus:border-[#3558DE]/60 focus:shadow-[0_0_0_3px_rgba(53,88,222,0.15)] disabled:opacity-50"
              >
                <option value="" disabled>
                  {institutionsLoading ? "Loading institutions…" : "Select an institution"}
                </option>
                {institutions.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
                <option value="__create_new__">+ Create new institution…</option>
              </select>
            )}
          </div>
        )}

        {/* Folder (standard) picker — required; every document is scoped to a
            class. Backed by /api/documents/standards so admins/teachers pick
            an existing folder instead of retyping it (and risking a typo
            forking the same class into two folders that can't see each
            other's docs), or create a brand new one explicitly. */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
            Standard / class folder <span className="ml-1 text-[12px] font-normal text-[var(--dim)]">Required. Scopes which students and quizzes can use this.</span>
          </label>

          {isCreatingFolder ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleConfirmNewFolder(); }
                  if (e.key === "Escape") handleCancelNewFolder();
                }}
                placeholder='New folder name, e.g. "5"'
                className="min-w-0 flex-1 rounded-md border border-[#3558DE]/40 bg-[var(--surface)]/70 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-shadow focus:border-[#3558DE]/60 focus:shadow-[0_0_0_3px_rgba(53,88,222,0.15)]"
              />
              <button
                type="button"
                onClick={handleConfirmNewFolder}
                disabled={!newFolderName.trim()}
                className="flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-3.5 py-2 text-[13px] font-semibold text-[#FFFFFF] shadow-[0_4px_12px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_rgba(53,88,222,0.65)] disabled:translate-y-0 disabled:opacity-30 disabled:shadow-none"
              >
                <Check size={14} strokeWidth={2.5} />
                Create
              </button>
              <button
                type="button"
                onClick={handleCancelNewFolder}
                className="flex items-center gap-1.5 rounded-md border border-[#4F7CFF]/15 bg-transparent px-3 py-2 text-[13px] text-[var(--muted)] transition-all hover:border-[#4F7CFF]/30 hover:bg-[var(--surface)]/60 hover:text-[var(--text)]"
              >
                <X size={13} strokeWidth={2.25} />
                Cancel
              </button>
            </div>
          ) : (
            <select
              value={standard}
              onChange={(e) => handleSelectFolder(e.target.value)}
              disabled={standardsLoading || (isAdmin && !institution.trim())}
              className="w-full rounded-md border border-[#4F7CFF]/15 bg-[var(--surface)]/70 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-shadow focus:border-[#3558DE]/60 focus:shadow-[0_0_0_3px_rgba(53,88,222,0.15)] disabled:opacity-50"
            >
              <option value="" disabled>
                {isAdmin && !institution.trim()
                  ? "Select an institution first"
                  : standardsLoading ? "Loading folders…" : "Select a folder"}
              </option>
              {standards.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__create_new__">+ Create new folder…</option>
            </select>
          )}
        </div>

        {/* Subject field */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-semibold text-[var(--text)]">
            Subject tag <span className="ml-1 text-[12px] font-normal text-[var(--dim)]">Optional. Filters retrieval.</span>
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. data-structures, distributed-systems"
            className="w-full rounded-md border border-[#4F7CFF]/15 bg-[var(--surface)]/70 px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-shadow focus:border-[#3558DE]/60 focus:shadow-[0_0_0_3px_rgba(53,88,222,0.15)]"
          />
        </div>

        {/* Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onClick={() => canUpload && fileInputRef.current?.click()}
          style={{ animation: isDragging ? "drop-pulse 1.4s ease-in-out infinite" : "none" }}
          className={`rounded-xl border-[1.5px] border-dashed px-4 py-8 text-center transition-all duration-150 sm:px-5 sm:py-9 ${
            !canUpload
              ? "cursor-not-allowed border-[var(--divider)] bg-[var(--surface)]/30 opacity-60"
              : "cursor-pointer " +
                (isDragging
                  ? "-translate-y-1 border-[#3558DE] bg-[#3558DE]/[0.07]"
                  : "border-[#4F7CFF]/15 bg-[var(--surface)]/50 hover:border-[#4F7CFF]/30")
          }`}
        >
          <div
            className={`mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border transition-all duration-200 ${
              isDragging
                ? "border-transparent bg-gradient-to-br from-[#4F80F8] to-[#3558DE] shadow-[0_6px_16px_-4px_rgba(53,88,222,0.55)]"
                : "border-[#4F7CFF]/20 bg-[#4F7CFF]/[0.08]"
            }`}
          >
            <Upload
              size={18}
              strokeWidth={2}
              className={`transition-colors ${isDragging ? "text-white" : "text-[var(--muted)]"}`}
            />
          </div>
          <div className="mb-1 text-sm text-[var(--text)]">
            {canUpload ? (
              <>Drop files here, or <span className="text-[var(--gold-ink)]">browse</span></>
            ) : isAdmin && !institution.trim() ? (
              "Select an institution above to enable uploads"
            ) : (
              "Set a standard above to enable uploads"
            )}
          </div>
          <div className="text-xs text-[var(--dim)]">PDF, DOCX or PPTX, up to {MAX_UPLOAD_MB} MB. Pictures are skipped automatically, so upload the book as it is (scanned pages can&apos;t be read). Re-uploading a file replaces the old copy.</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx"
            disabled={!canUpload}
            onChange={(e) => {
              if (e.target.files?.length) addFilesToQueue(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-[var(--muted)]">
                {queue.length} file{queue.length !== 1 ? "s" : ""} in queue
              </span>
              <div className="flex gap-2">
                {hasFinished && (
                  <button
                    onClick={clearFinished}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[var(--muted)] transition-all hover:bg-[var(--surface)]/70 hover:text-[var(--text)]"
                  >
                    <Trash2 size={12} strokeWidth={2} />
                    Clear finished
                  </button>
                )}
                {queuedCount > 0 && (
                  <button
                    onClick={uploadAllQueued}
                    className="flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#4F80F8] to-[#3558DE] px-3.5 py-1.5 text-[13px] font-semibold text-[#FFFFFF] shadow-[0_4px_12px_-4px_rgba(53,88,222,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_rgba(53,88,222,0.65)] active:translate-y-0"
                  >
                    <Upload size={13} strokeWidth={2.25} />
                    Upload {queuedCount}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  style={{ animation: "queue-in 220ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${idx * 25}ms` }}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--divider)] bg-[var(--surface)]/60 px-3 py-2.5 text-[13px]"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#4F7CFF]/10 text-[var(--muted)]">
                    <FileText size={13} strokeWidth={2} />
                  </span>
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.file.name}</span>
                  <span className="hidden flex-shrink-0 text-xs text-[var(--dim)] sm:inline">
                    {fileSize(item.file.size)}
                  </span>

                  {item.status === STATUS.QUEUED && (
                    <span className="flex-shrink-0 text-xs text-[var(--muted)]">Queued</span>
                  )}
                  {item.status === STATUS.UPLOADING && (
                    <span className="flex flex-shrink-0 items-center gap-1.5 text-xs text-[var(--muted)]">
                      <Loader2 size={14} className="animate-spin text-[var(--accent-ink)]" />
                      <span className="hidden sm:inline">Uploading…</span>
                    </span>
                  )}
                  {item.status === STATUS.PROCESSING && (
                    <span title={item.note} className="flex min-w-0 max-w-[45%] flex-shrink items-center gap-1.5 text-xs text-[var(--muted)]">
                      <Loader2 size={14} className="flex-shrink-0 animate-spin text-[var(--accent-ink)]" />
                      <span className="hidden truncate sm:inline">{item.note}</span>
                    </span>
                  )}
                  {item.status === STATUS.DONE && (
                    <span title={item.note || "Ready"} className="flex flex-shrink-0 items-center gap-1.5 text-xs text-[var(--muted)]">
                      <CheckCircle2 size={14} className="text-[var(--ok)]" />
                      {item.note && <span className="hidden sm:inline">{item.note}</span>}
                    </span>
                  )}
                  {item.status === STATUS.ERROR && (
                    <span title={item.error} className="flex min-w-0 max-w-[50%] flex-shrink items-center gap-1 text-[#E2725B]">
                      <AlertCircle size={13} className="flex-shrink-0" /> <span className="hidden truncate text-xs sm:inline">{item.error || "Failed"}</span>
                    </span>
                  )}

                  {item.status !== STATUS.UPLOADING && item.status !== STATUS.PROCESSING && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="-m-1 flex-shrink-0 rounded-full bg-transparent p-1.5 text-[var(--dim)] transition-all hover:bg-[var(--surface)] hover:text-[var(--text)] active:scale-90"
                    >
                      <X size={13} strokeWidth={2.25} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ingested documents list */}
        <div className="mt-9">
          <div className="mb-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="section-title">
              <span className="thread-dot inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
              Ingested documents
            </h2>

            {/* Admin-only: flip between "this folder" (same scoping teachers
                get) and "everything" — every document across every school,
                for auditing or cleanup. */}
            {isAdmin && (
              <div className="flex overflow-hidden rounded-full border border-[#4F7CFF]/15 bg-[var(--surface)]/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode("folder")}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-all ${
                    viewMode === "folder"
                      ? "bg-[#2DD4BF]/15 text-[var(--text)] shadow-sm"
                      : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <Folder size={12} strokeWidth={2.25} />
                  This folder
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-all ${
                    viewMode === "all"
                      ? "bg-[#2DD4BF]/15 text-[var(--text)] shadow-sm"
                      : "bg-transparent text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <Layers size={12} strokeWidth={2.25} />
                  All documents
                </button>
              </div>
            )}
          </div>

          {listError && (
            <div className="mb-3 rounded-lg border border-[#E2725B]/30 bg-[var(--error-bg)]/60 px-3 py-2.5 text-[13px] text-[var(--error-text)]">
              Couldn't load documents. {listError}
            </div>
          )}

          {listLoading ? (
            <div className="py-5 text-[13px] text-[var(--dim)]">Loading…</div>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-[var(--divider)] px-4 py-7 text-center text-[13px] text-[var(--dim)]">
              {isAdmin && viewMode === "all"
                ? "No documents have been ingested anywhere yet."
                : "Nothing ingested yet. Upload a document above to start building the knowledge base."}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--divider)]">
              {/* overflow-x-auto lets the table scroll sideways instead of
                  breaking the page layout on narrow screens */}
              <div className="lm-scroll max-h-[360px] overflow-x-auto overflow-y-auto">
                <table className={`w-full ${showScopeColumns ? "min-w-[760px]" : "min-w-[560px]"} border-collapse text-[13px]`}>
                  <thead>
                    <tr className="bg-[var(--surface)]/70 text-left text-[var(--dim)]">
                      <th className="px-3 py-2.5 font-medium">Source</th>
                      {showScopeColumns && <th className="px-3 py-2.5 font-medium">Institution</th>}
                      {showScopeColumns && <th className="px-3 py-2.5 font-medium">Standard</th>}
                      <th className="px-3 py-2.5 font-medium">Subject</th>
                      {showScopeColumns && <th className="px-3 py-2.5 font-medium">Owner</th>}
                      <th className="px-3 py-2.5 font-medium">Uploaded</th>
                      <th className="px-3 py-2.5 font-medium">Chunks</th>
                      <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="lm-row border-t border-[var(--divider)]">
                        <td className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <FileText size={13} strokeWidth={2} className="flex-shrink-0 text-[#4F7CFF]" />
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                              {doc.source ?? doc.fileName ?? "Untitled"}
                            </span>
                          </span>
                        </td>
                        {showScopeColumns && (
                          <td className="px-3 py-2.5 text-[var(--muted)]">{doc.institution || "—"}</td>
                        )}
                        {showScopeColumns && (
                          <td className="px-3 py-2.5 text-[var(--muted)]">{doc.standard || "—"}</td>
                        )}
                        <td className="px-3 py-2.5 text-[var(--muted)]">{doc.subject || "—"}</td>
                        {showScopeColumns && (
                          <td className="px-3 py-2.5 text-[var(--muted)]">{doc.ownerUsername || "—"}</td>
                        )}
                        <td className="px-3 py-2.5 text-[var(--muted)]">{formatDate(doc.uploadDate ?? doc.createdAt)}</td>
                        <td className="px-3 py-2.5 text-[var(--muted)]">{doc.chunkCount ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleDelete(doc.id)}
                              disabled={deletingId === doc.id}
                              title="Remove this document and its chunks"
                              aria-label="Remove document"
                              className={`-m-1.5 rounded-full p-2 transition-all ${
                                deletingId === doc.id
                                  ? "cursor-default bg-transparent text-[#3A4A45]"
                                  : "cursor-pointer bg-transparent text-[#E2725B] hover:bg-[#E2725B]/10 hover:text-[var(--error-text)] active:scale-90"
                              }`}
                            >
                              {deletingId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.25} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}