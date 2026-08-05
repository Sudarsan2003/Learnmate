import { useState, useEffect, useCallback } from "react";
import { Users, RefreshCw, Loader2, ShieldCheck } from "lucide-react";
import { listUsers, updateUserRole } from "../api/client";

const ROLES = ["USER", "TEACHER", "ADMIN"];

export default function ManageUsers({ currentUsername }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUsername, setUpdatingUsername] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (username, newRole) => {
    setUpdatingUsername(username);
    setError(null);
    try {
      await updateUserRole(username, newRole);
      setUsers((prev) => prev.map((u) => (u.username === username ? { ...u, role: newRole } : u)));
    } catch (err) {
      setError(err.response?.data?.message ?? `Could not update role for ${username}.`);
    } finally {
      setUpdatingUsername(null);
    }
  };

  return (
    <div className="doc-upload min-h-full bg-[#0B0E14] px-4 py-6 font-mono text-[#EDE6D6] sm:px-8 sm:py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        .doc-upload { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; }
        .lm-row { transition: background 140ms ease; }
        .lm-row:hover { background: rgba(45,212,191,0.05); }
        .lm-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .lm-scroll::-webkit-scrollbar-thumb { background: #22283a; border-radius: 4px; }
      `}</style>

      <div className="mx-auto max-w-[820px]">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <h1 className="m-0 flex items-center gap-2 text-[19px] font-bold tracking-tight text-[#EDE6D6] sm:text-[22px]">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#E4C87A] to-[#8A6A22]">
                <Users size={12} className="text-[#0B0E14]" />
              </span>
              manage users <span className="text-[#C89B3C]">·</span> admin
            </h1>
            <p className="mt-1.5 text-[13px] text-[#9FB0AC]">
              promote learners to teacher so they can upload documents, or grant admin
            </p>
          </div>
          <button
            onClick={loadUsers}
            className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-md border border-[#2DD4BF]/15 bg-transparent px-3 py-2 text-xs text-[#9FB0AC] transition-all hover:-translate-y-0.5 hover:border-[#2DD4BF]/40 hover:text-[#EDE6D6]"
          >
            <RefreshCw size={13} strokeWidth={2} />
            refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[#E2725B]/30 bg-[#2A1620]/60 px-3 py-2.5 text-xs text-[#F3B9A8]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-5 text-xs text-[#6E7C79]">loading…</div>
        ) : users.length === 0 ? (
          <div className="rounded-lg border border-[#1B2333] px-4 py-7 text-center text-xs text-[#6E7C79]">
            no users found
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[#1B2333]">
            <div className="lm-scroll max-h-[480px] overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="bg-[#12151F]/70 text-left text-[#6E7C79]">
                    <th className="px-3 py-2.5 font-medium">username</th>
                    <th className="px-3 py-2.5 font-medium">email</th>
                    <th className="px-3 py-2.5 font-medium">institution</th>
                    <th className="px-3 py-2.5 font-medium">role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="lm-row border-t border-[#1B2333]">
                      <td className="max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap px-3 py-2.5">
                        {u.username}
                        {u.username === currentUsername && (
                          <span className="ml-1.5 text-[10px] text-[#6E7C79]">(you)</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[#9FB0AC]">{u.email || "—"}</td>
                      <td className="px-3 py-2.5 text-[#9FB0AC]">{u.institution || "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={u.role}
                            disabled={updatingUsername === u.username || u.username === currentUsername}
                            onChange={(e) => handleRoleChange(u.username, e.target.value)}
                            className="rounded-md border border-[#2DD4BF]/15 bg-[#12151F]/70 px-2 py-1.5 text-[11px] text-[#EDE6D6] outline-none transition-shadow focus:border-[#C89B3C]/60 disabled:opacity-40"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          {updatingUsername === u.username && (
                            <Loader2 size={13} className="animate-spin text-[#C89B3C]" />
                          )}
                          {u.role === "ADMIN" && updatingUsername !== u.username && (
                            <ShieldCheck size={13} className="text-[#C89B3C]" />
                          )}
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
  );
}