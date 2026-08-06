import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, Trash2, RefreshCw, X, CheckCircle2, AlertCircle, Loader2, Feather } from "lucide-react";


const STATUS = {
  QUEUED: "queued",
  UPLOADING: "uploading",
  DONE: "done",
  ERROR: "error",
};

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
  }, [apiBase, authHeaders, standard, isAdmin, institution]);

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
      setInstitutions(Array.isArray(data) ? data : []);
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

    setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: STATUS.UPLOADING } : i)));

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
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `${res.status} ${res.statusText}`);
      }
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: STATUS.DONE } : i)));
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

  return (
    <div className="doc-upload min-h-full bg-[#0B0E14] px-4 py-6 font-mono text-[#EDE6D6] sm:px-8 sm:py-8" style={{ perspective: "1400px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .doc-upload { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; }
        .lm-row { transition: background 140ms ease, transform 140ms ease; transform-style: preserve-3d; }
        .lm-row:hover { background: rgba(45,212,191,0.05); transform: translateZ(4px); }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: #22283a; border-radius: 4px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes queue-in {
          from { opacity: 0; transform: translateY(-6px) rotateX(-10deg); }
          to { opacity: 1; transform: translateY(0) rotateX(0deg); }
        }
        @keyframes drop-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(45,212,191,0.25); }
          50% { box-shadow: 0 0 0 10px rgba(45,212,191,0); }
        }
      `}</style>

      <div className="mx-auto max-w-[920px]" style={{ transformStyle: "preserve-3d" }}>
        {/* Header */}
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[19px] font-bold tracking-tight text-[#EDE6D6] sm:text-[22px]">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22]">
                <Feather size={12} className="text-[#0B0E14]" />
              </span>
              document ingestion <span className="text-[#C89B3C]">·</span> {role === "TEACHER" ? "teacher" : "admin"}
            </h1>
            <p className="mt-1.5 text-[13px] text-[#9FB0AC]">
              upload subject material for the knowledge base — parsed, chunked, embedded automatically
            </p>
          </div>
          <button
            onClick={loadDocuments}
            className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[#9FB0AC] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[#EDE6D6]"
          >
            <RefreshCw size={13} strokeWidth={2} />
            refresh
          </button>
        </div>

        {/* Institution picker — admin only. Admins upload on behalf of any
            school and must say which one explicitly; teachers never see
            this, they're always scoped server-side to their own account's
            institution. Folder options below are scoped to whichever
            institution is picked here. */}
        {isAdmin && (
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] text-[#9FB0AC]">
              institution (required — which school this upload belongs to)
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
                  placeholder='new institution name, e.g. "SRV"'
                  className="flex-1 rounded-md border border-[#C89B3C]/40 bg-[#12151F]/70 px-3 py-2.5 text-[13px] text-[#EDE6D6] outline-none transition-shadow focus:border-[#C89B3C]/60 focus:shadow-[0_0_0_3px_rgba(200,155,60,0.15)]"
                />
                <button
                  type="button"
                  onClick={handleConfirmNewInstitution}
                  disabled={!newInstitutionName.trim()}
                  className="rounded-md bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-3.5 py-2 text-xs font-semibold text-[#0B0E14] transition-all disabled:opacity-30"
                >
                  create
                </button>
                <button
                  type="button"
                  onClick={handleCancelNewInstitution}
                  className="rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[#9FB0AC] transition-colors hover:text-[#EDE6D6]"
                >
                  cancel
                </button>
              </div>
            ) : (
              <select
                value={institution}
                onChange={(e) => handleSelectInstitution(e.target.value)}
                disabled={institutionsLoading}
                className="w-full rounded-md border border-[#2DD4BF]/15 bg-[#12151F]/70 px-3 py-2.5 text-[13px] text-[#EDE6D6] outline-none transition-shadow focus:border-[#C89B3C]/60 focus:shadow-[0_0_0_3px_rgba(200,155,60,0.15)] disabled:opacity-50"
              >
                <option value="" disabled>
                  {institutionsLoading ? "loading institutions…" : "select an institution"}
                </option>
                {institutions.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
                <option value="__create_new__">+ create new institution…</option>
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
          <label className="mb-1.5 block text-[11px] text-[#9FB0AC]">
            standard / class folder (required — scopes which students & quizzes can use this)
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
                placeholder='new folder name, e.g. "5"'
                className="flex-1 rounded-md border border-[#C89B3C]/40 bg-[#12151F]/70 px-3 py-2.5 text-[13px] text-[#EDE6D6] outline-none transition-shadow focus:border-[#C89B3C]/60 focus:shadow-[0_0_0_3px_rgba(200,155,60,0.15)]"
              />
              <button
                type="button"
                onClick={handleConfirmNewFolder}
                disabled={!newFolderName.trim()}
                className="rounded-md bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-3.5 py-2 text-xs font-semibold text-[#0B0E14] transition-all disabled:opacity-30"
              >
                create
              </button>
              <button
                type="button"
                onClick={handleCancelNewFolder}
                className="rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[#9FB0AC] transition-colors hover:text-[#EDE6D6]"
              >
                cancel
              </button>
            </div>
          ) : (
            <select
              value={standard}
              onChange={(e) => handleSelectFolder(e.target.value)}
              disabled={standardsLoading || (isAdmin && !institution.trim())}
              className="w-full rounded-md border border-[#2DD4BF]/15 bg-[#12151F]/70 px-3 py-2.5 text-[13px] text-[#EDE6D6] outline-none transition-shadow focus:border-[#C89B3C]/60 focus:shadow-[0_0_0_3px_rgba(200,155,60,0.15)] disabled:opacity-50"
            >
              <option value="" disabled>
                {isAdmin && !institution.trim()
                  ? "select an institution first"
                  : standardsLoading ? "loading folders…" : "select a folder"}
              </option>
              {standards.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__create_new__">+ create new folder…</option>
            </select>
          )}
        </div>

        {/* Subject field */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[11px] text-[#9FB0AC]">
            subject tag (optional — filters retrieval)
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. data-structures, distributed-systems"
            className="w-full rounded-md border border-[#2DD4BF]/15 bg-[#12151F]/70 px-3 py-2.5 text-[13px] text-[#EDE6D6] outline-none transition-shadow focus:border-[#C89B3C]/60 focus:shadow-[0_0_0_3px_rgba(200,155,60,0.15)]"
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
              ? "cursor-not-allowed border-[#1B2333] bg-[#12151F]/30 opacity-60"
              : "cursor-pointer " +
                (isDragging
                  ? "-translate-y-1 border-[#C89B3C] bg-[#C89B3C]/[0.07]"
                  : "border-[#2DD4BF]/15 bg-[#12151F]/50 hover:border-[#2DD4BF]/30")
          }`}
        >
          <Upload
            size={22}
            strokeWidth={1.5}
            className={`mx-auto mb-2.5 transition-colors ${isDragging ? "text-[#C89B3C]" : "text-[#9FB0AC]"}`}
          />
          <div className="mb-1 text-[13px] text-[#EDE6D6]">
            {canUpload ? (
              <>drop files here, or <span className="text-[#C89B3C]">browse</span></>
            ) : isAdmin && !institution.trim() ? (
              "select an institution above to enable uploads"
            ) : (
              "set a standard above to enable uploads"
            )}
          </div>
          <div className="text-[11px] text-[#6E7C79]">pdf, docx, pptx — re-uploading a source replaces its old chunks</div>
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
              <span className="text-[11px] text-[#9FB0AC]">
                {queue.length} file{queue.length !== 1 ? "s" : ""} in queue
              </span>
              <div className="flex gap-2">
                {hasFinished && (
                  <button
                    onClick={clearFinished}
                    className="bg-transparent text-[11px] text-[#9FB0AC] underline transition-colors hover:text-[#EDE6D6]"
                  >
                    clear finished
                  </button>
                )}
                {queuedCount > 0 && (
                  <button
                    onClick={uploadAllQueued}
                    className="rounded-md bg-gradient-to-br from-[#E4C87A] to-[#C89B3C] px-3.5 py-1.5 text-xs font-semibold text-[#0B0E14] shadow-[0_4px_12px_-4px_rgba(200,155,60,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_18px_-6px_rgba(200,155,60,0.65)]"
                  >
                    upload {queuedCount}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {queue.map((item, idx) => (
                <div
                  key={item.id}
                  style={{ animation: "queue-in 220ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${idx * 25}ms` }}
                  className="flex items-center gap-2.5 rounded-lg border border-[#1B2333] bg-[#12151F]/60 px-3 py-2.5 text-xs"
                >
                  <FileText size={14} className="flex-shrink-0 text-[#9FB0AC]" />
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{item.file.name}</span>
                  <span className="hidden flex-shrink-0 text-[11px] text-[#6E7C79] sm:inline">
                    {(item.file.size / 1024).toFixed(0)} kb
                  </span>

                  {item.status === STATUS.QUEUED && (
                    <span className="flex-shrink-0 text-[11px] text-[#9FB0AC]">queued</span>
                  )}
                  {item.status === STATUS.UPLOADING && (
                    <Loader2 size={14} className="flex-shrink-0 animate-spin text-[#C89B3C]" />
                  )}
                  {item.status === STATUS.DONE && (
                    <CheckCircle2 size={14} className="flex-shrink-0 text-[#2DD4BF]" />
                  )}
                  {item.status === STATUS.ERROR && (
                    <span title={item.error} className="flex flex-shrink-0 items-center gap-1 text-[#E2725B]">
                      <AlertCircle size={13} /> <span className="hidden text-[11px] sm:inline">failed</span>
                    </span>
                  )}

                  {item.status !== STATUS.UPLOADING && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      className="flex-shrink-0 bg-transparent p-0.5 text-[#6E7C79] transition-colors hover:text-[#EDE6D6]"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ingested documents list */}
        <div className="mt-9">
          <h2 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold tracking-wide text-[#9FB0AC]">
            <span className="thread-dot inline-block h-[5px] w-[5px] rounded-full bg-[#2DD4BF] shadow-[0_0_6px_1px_rgba(45,212,191,0.6)]" />
            ingested documents
          </h2>

          {listError && (
            <div className="mb-3 rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
              couldn't load documents — {listError}
            </div>
          )}

          {listLoading ? (
            <div className="py-5 text-xs text-[#6E7C79]">loading…</div>
          ) : documents.length === 0 ? (
            <div className="rounded-lg border border-[#1B2333] px-4 py-7 text-center text-xs text-[#6E7C79]">
              nothing ingested yet — upload a document above to start building the knowledge base
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#1B2333]">
              {/* overflow-x-auto lets the table scroll sideways instead of
                  breaking the page layout on narrow screens */}
              <div className="lm-scroll max-h-[360px] overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[560px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#12151F]/70 text-left text-[#6E7C79]">
                      <th className="px-3 py-2.5 font-medium">source</th>
                      <th className="px-3 py-2.5 font-medium">subject</th>
                      <th className="px-3 py-2.5 font-medium">uploaded</th>
                      <th className="px-3 py-2.5 font-medium">chunks</th>
                      <th className="px-3 py-2.5 text-right font-medium">actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="lm-row border-t border-[#1B2333]">
                        <td className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5">
                          {doc.source ?? doc.fileName ?? "untitled"}
                        </td>
                        <td className="px-3 py-2.5 text-[#9FB0AC]">{doc.subject || "—"}</td>
                        <td className="px-3 py-2.5 text-[#9FB0AC]">{formatDate(doc.uploadDate ?? doc.createdAt)}</td>
                        <td className="px-3 py-2.5 text-[#9FB0AC]">{doc.chunkCount ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleDelete(doc.id)}
                              disabled={deletingId === doc.id}
                              title="Remove this document and its chunks"
                              className={`bg-transparent p-0.5 transition-colors ${
                                deletingId === doc.id ? "cursor-default text-[#3A4A45]" : "cursor-pointer text-[#E2725B] hover:text-[#F3B9A8]"
                              }`}
                            >
                              {deletingId === doc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
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