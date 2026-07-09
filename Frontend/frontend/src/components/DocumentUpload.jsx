import { useState, useEffect, useCallback, useRef } from "react";
import { Upload, FileText, Trash2, RefreshCw, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/**
 * Admin-only document ingestion panel for LearnMate.
 *
 * Render this only when the logged-in user has ROLE_ADMIN — this component
 * assumes it has already been gated by the parent (e.g. inside your
 * existing `log out (admin)` branch). The backend re-checks the role on
 * every call via @PreAuthorize, so this is a UX gate, not a security one.
 *
 * Props:
 *  - token: string           JWT to send as Authorization: Bearer <token>
 *  - apiBase?: string        defaults to "/api/documents"
 */

const STATUS = {
  QUEUED: "queued",
  UPLOADING: "uploading",
  DONE: "done",
  ERROR: "error",
};

export default function DocumentUpload({ token, apiBase = "/api/documents" }) {
  const [documents, setDocuments] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [subject, setSubject] = useState("");
  const [queue, setQueue] = useState([]); // { id, file, status, error }
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch(apiBase, { headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : data.documents ?? []);
    } catch (err) {
      setListError(err.message || "Could not load the document list.");
    } finally {
      setListLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const addFilesToQueue = (fileList) => {
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
    setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: STATUS.UPLOADING } : i)));

    const formData = new FormData();
    formData.append("file", item.file);
    if (subject.trim()) formData.append("subject", subject.trim());

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

  const handleReprocess = async (id) => {
    try {
      const res = await fetch(`${apiBase}/${id}/reprocess`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      loadDocuments();
    } catch (err) {
      setListError(err.message || "Could not reprocess that document.");
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
    <div
      style={{
        minHeight: "100%",
        background: "#0d1912",
        color: "#e9ede6",
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        padding: "32px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .lm-btn { transition: background 120ms ease, opacity 120ms ease, transform 60ms ease; }
        .lm-btn:active { transform: translateY(1px); }
        .lm-row:hover { background: #16261c; }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: #2a3a2f; border-radius: 4px; }
      `}</style>

      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
              document ingestion <span style={{ color: "#e8a33d" }}>·</span> admin
            </h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#7f9284" }}>
              upload subject material for the knowledge base — parsed, chunked, embedded automatically
            </p>
          </div>
          <button
            onClick={loadDocuments}
            className="lm-btn"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "transparent",
              border: "1px solid #2a3a2f",
              color: "#a9baad",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            <RefreshCw size={13} strokeWidth={2} />
            refresh
          </button>
        </div>

        {/* Subject field */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: "#7f9284", marginBottom: 6 }}>
            subject tag (optional — filters retrieval)
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. data-structures, distributed-systems"
            style={{
              width: "100%",
              background: "#0f1b14",
              border: "1px solid #2a3a2f",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 13,
              color: "#e9ede6",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#e8a33d")}
            onBlur={(e) => (e.target.style.borderColor = "#2a3a2f")}
          />
        </div>

        {/* Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${isDragging ? "#e8a33d" : "#2a3a2f"}`,
            borderRadius: 10,
            padding: "36px 20px",
            textAlign: "center",
            cursor: "pointer",
            background: isDragging ? "rgba(232,163,61,0.06)" : "#101d16",
            transition: "border-color 150ms ease, background 150ms ease",
          }}
        >
          <Upload size={22} strokeWidth={1.5} color={isDragging ? "#e8a33d" : "#7f9284"} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13, color: "#e9ede6", marginBottom: 4 }}>
            drop files here, or <span style={{ color: "#e8a33d" }}>browse</span>
          </div>
          <div style={{ fontSize: 11, color: "#5f7367" }}>pdf, docx, pptx — re-uploading a source replaces its old chunks</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx"
            onChange={(e) => {
              if (e.target.files?.length) addFilesToQueue(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />
        </div>

        {/* Queue */}
        {queue.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#7f9284" }}>
                {queue.length} file{queue.length !== 1 ? "s" : ""} in queue
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {hasFinished && (
                  <button
                    onClick={clearFinished}
                    className="lm-btn"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#7f9284",
                      fontSize: 11,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    clear finished
                  </button>
                )}
                {queuedCount > 0 && (
                  <button
                    onClick={uploadAllQueued}
                    className="lm-btn"
                    style={{
                      background: "#e8a33d",
                      color: "#1a1108",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    upload {queuedCount}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {queue.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: "#101d16",
                    border: "1px solid #1e2e24",
                    borderRadius: 8,
                    padding: "9px 12px",
                    fontSize: 12,
                  }}
                >
                  <FileText size={14} color="#7f9284" style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.file.name}
                  </span>
                  <span style={{ color: "#5f7367", fontSize: 11 }}>{(item.file.size / 1024).toFixed(0)} kb</span>

                  {item.status === STATUS.QUEUED && <span style={{ color: "#7f9284", fontSize: 11 }}>queued</span>}
                  {item.status === STATUS.UPLOADING && (
                    <Loader2 size={14} color="#e8a33d" className="lm-spin" style={{ animation: "spin 0.8s linear infinite" }} />
                  )}
                  {item.status === STATUS.DONE && <CheckCircle2 size={14} color="#5fb87c" />}
                  {item.status === STATUS.ERROR && (
                    <span title={item.error} style={{ display: "flex", alignItems: "center", gap: 4, color: "#d9694f" }}>
                      <AlertCircle size={13} /> <span style={{ fontSize: 11 }}>failed</span>
                    </span>
                  )}

                  {item.status !== STATUS.UPLOADING && (
                    <button
                      onClick={() => removeFromQueue(item.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#5f7367", padding: 2 }}
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
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 13, color: "#7f9284", fontWeight: 600, margin: "0 0 10px", letterSpacing: "0.02em" }}>
            ingested documents
          </h2>

          {listError && (
            <div
              style={{
                background: "rgba(217,105,79,0.1)",
                border: "1px solid rgba(217,105,79,0.3)",
                color: "#e08a72",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              couldn't load documents — {listError}
            </div>
          )}

          {listLoading ? (
            <div style={{ color: "#5f7367", fontSize: 12, padding: "20px 0" }}>loading…</div>
          ) : documents.length === 0 ? (
            <div
              style={{
                border: "1px solid #1e2e24",
                borderRadius: 8,
                padding: "28px 16px",
                textAlign: "center",
                color: "#5f7367",
                fontSize: 12,
              }}
            >
              nothing ingested yet — upload a document above to start building the knowledge base
            </div>
          ) : (
            <div style={{ border: "1px solid #1e2e24", borderRadius: 8, overflow: "hidden" }}>
              <div
                className="lm-scroll"
                style={{ maxHeight: 360, overflowY: "auto" }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#101d16", color: "#5f7367", textAlign: "left" }}>
                      <th style={{ padding: "9px 12px", fontWeight: 500 }}>source</th>
                      <th style={{ padding: "9px 12px", fontWeight: 500 }}>subject</th>
                      <th style={{ padding: "9px 12px", fontWeight: 500 }}>uploaded</th>
                      <th style={{ padding: "9px 12px", fontWeight: 500 }}>chunks</th>
                      <th style={{ padding: "9px 12px", fontWeight: 500, textAlign: "right" }}>actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="lm-row" style={{ borderTop: "1px solid #1e2e24" }}>
                        <td style={{ padding: "10px 12px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.source ?? doc.fileName ?? "untitled"}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#a9baad" }}>{doc.subject || "—"}</td>
                        <td style={{ padding: "10px 12px", color: "#a9baad" }}>{formatDate(doc.uploadDate ?? doc.createdAt)}</td>
                        <td style={{ padding: "10px 12px", color: "#a9baad" }}>{doc.chunkCount ?? "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => handleReprocess(doc.id)}
                              title="Re-chunk and re-embed this document"
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#7f9284", padding: 2 }}
                            >
                              <RefreshCw size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              disabled={deletingId === doc.id}
                              title="Remove this document and its chunks"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: deletingId === doc.id ? "default" : "pointer",
                                color: deletingId === doc.id ? "#3f5247" : "#d9694f",
                                padding: 2,
                              }}
                            >
                              {deletingId === doc.id ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Trash2 size={13} />}
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}