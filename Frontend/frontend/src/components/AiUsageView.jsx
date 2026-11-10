import { useCallback, useEffect, useState } from "react";
import { Cpu, RefreshCw } from "lucide-react";
import { getAiUsage, setSchoolDailyLimit } from "../api/client";

// "AI usage" tab of Manage users (ADMIN only): questions asked, tokens and the
// estimated AI cost per school, the heaviest users and a per-day trend. The
// LearnMate owner sees every school and can set each school's daily question
// limit per student; a school's own admin sees only their school.
// Rendered inside ManageUsers, so it uses that page's um-* styles.

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const num = (n) => (n ?? 0).toLocaleString("en-IN");
const inr = (n) => `₹${(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const usd = (n) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tokens = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : num(n));

export default function AiUsageView({ owner }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [limitDraft, setLimitDraft] = useState({}); // school id -> text being edited
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAiUsage(d));
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not load AI usage.");
    } finally {
      setLoading(false);
    }
  }, []);

  // First load; changing the period or "Refresh" calls load() directly.
  useEffect(() => {
    let cancelled = false;
    getAiUsage(30)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.response?.data?.message ?? "Could not load AI usage."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function choosePeriod(d) {
    setDays(d);
    load(d);
  }

  async function saveLimit(school, text) {
    setBusyId(school.schoolId);
    setError(null);
    try {
      const value = text === null || text.trim() === "" ? null : text.trim();
      const updated = await setSchoolDailyLimit(school.schoolId, value);
      setData((prev) => ({
        ...prev,
        schools: prev.schools.map((s) =>
          s.schoolId === school.schoolId ? { ...s, dailyQuestionLimit: updated.dailyQuestionLimit } : s,
        ),
      }));
      setLimitDraft((d) => {
        const next = { ...d };
        delete next[school.schoolId];
        return next;
      });
    } catch (err) {
      setError(err.response?.data?.message ?? "Could not save the limit.");
    } finally {
      setBusyId(null);
    }
  }

  // Every day of the period, with zero for days nobody used the AI, so bars line up with dates.
  const dailyFull = [];
  if (data?.daily?.length) {
    const byDay = new Map(data.daily.map((d) => [d.day, d]));
    for (let t = Date.parse(`${data.from}T00:00:00Z`); t <= Date.parse(`${data.to}T00:00:00Z`); t += 86_400_000) {
      const day = new Date(t).toISOString().slice(0, 10);
      dailyFull.push(byDay.get(day) ?? { day, requests: 0, costInr: 0 });
    }
  }
  const maxDaily = Math.max(1, ...dailyFull.map((d) => d.costInr));

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="um-tabs !m-0" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              className="um-tab"
              aria-pressed={days === p.days}
              onClick={() => choosePeriod(p.days)}
            >
              Last {p.label}
            </button>
          ))}
        </div>
        <button type="button" className="um-btn um-btn-quiet um-btn-sm ml-auto" onClick={() => load(days)}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="um-empty" role="alert">
          <p className="um-empty-title">{error}</p>
        </div>
      )}

      {loading && !data ? (
        <div className="um-card px-5 py-4" aria-busy="true" aria-label="Loading AI usage">
          <span className="block h-4 w-1/3 animate-pulse rounded um-skel" />
          <span className="mt-3 block h-3 w-1/2 animate-pulse rounded um-skel" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Questions asked" value={num(data.totals.requests)} />
            <Stat label="Estimated AI cost" value={inr(data.totals.costInr)} hint={usd(data.totals.costUsd)} />
            <Stat
              label="Tokens (in / out)"
              value={`${tokens(data.totals.inputTokens)} / ${tokens(data.totals.outputTokens)}`}
            />
            <Stat
              label="Default daily limit"
              value={data.defaultStudentDailyLimit > 0 ? `${data.defaultStudentDailyLimit} / student` : "None"}
            />
          </div>

          <section className="um-card overflow-hidden">
            <h3 className="um-label px-5 pt-4">By school</h3>
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[640px] text-left text-[13.5px]">
                <thead className="um-dim text-[12.5px]">
                  <tr>
                    <th className="px-5 py-2 font-medium">School</th>
                    <th className="px-3 py-2 text-right font-medium">Active students</th>
                    <th className="px-3 py-2 text-right font-medium">Questions</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                    <th className="px-3 py-2 text-right font-medium">Per active student</th>
                    <th className="px-5 py-2 font-medium">Daily limit per student</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--um-line-strong)]">
                  {data.schools.map((s) => {
                    const draft = limitDraft[s.schoolId];
                    const current = s.dailyQuestionLimit;
                    return (
                      <tr key={s.school || "(none)"}>
                        <td className="px-5 py-2.5 font-medium">{s.school || <span className="um-dim">No school</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {num(s.activeStudents)} <span className="um-dim">of {num(s.students)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(s.requests)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" title={usd(s.costUsd)}>
                          {inr(s.costInr)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {s.costPerActiveStudentInr == null ? "—" : inr(s.costPerActiveStudentInr)}
                        </td>
                        <td className="px-5 py-2.5">
                          {owner && s.schoolId ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                aria-label={`Daily question limit for ${s.school}`}
                                className="um-input um-btn-sm w-20 py-1"
                                placeholder={String(data.defaultStudentDailyLimit)}
                                value={draft ?? (current ?? "")}
                                onChange={(e) => setLimitDraft((d) => ({ ...d, [s.schoolId]: e.target.value }))}
                                disabled={busyId === s.schoolId}
                              />
                              {draft !== undefined && draft !== String(current ?? "") && (
                                <button
                                  type="button"
                                  className="um-btn um-btn-primary um-btn-sm"
                                  onClick={() => saveLimit(s, draft)}
                                  disabled={busyId === s.schoolId}
                                >
                                  Save
                                </button>
                              )}
                              <span className="um-dim text-[12px]">
                                {current == null ? "default" : current === 0 ? "no limit" : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="um-dim">
                              {current == null
                                ? `${data.defaultStudentDailyLimit} (default)`
                                : current === 0
                                  ? "No limit"
                                  : current}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {owner && (
              <p className="um-dim px-5 pb-4 pt-2 text-[12.5px]">
                Leave the limit empty to use the default, or enter 0 for no limit. Limits count questions per student per
                day (India time).
              </p>
            )}
          </section>

          {dailyFull.length > 0 && (
            <section className="um-card px-5 py-4">
              <h3 className="um-label">Cost per day</h3>
              <div className="mt-3 flex h-28 items-end gap-[3px]" role="img" aria-label="Estimated AI cost per day">
                {dailyFull.map((d) => (
                  <div
                    key={d.day}
                    className="min-w-[4px] flex-1 rounded-t bg-[#4F80F8]"
                    style={{ height: d.costInr > 0 ? `${Math.max(2, (d.costInr / maxDaily) * 100)}%` : "1px" }}
                    title={`${d.day}: ${inr(d.costInr)} · ${num(d.requests)} questions`}
                  />
                ))}
              </div>
              <div className="um-dim mt-1 flex justify-between text-[12px]">
                <span>{dailyFull[0].day}</span>
                <span>{dailyFull[dailyFull.length - 1].day}</span>
              </div>
            </section>
          )}

          <section className="um-card overflow-hidden">
            <h3 className="um-label px-5 pt-4">Heaviest users</h3>
            {data.topUsers.length === 0 ? (
              <div className="um-empty">
                <Cpu size={24} aria-hidden="true" />
                <p className="um-empty-title">No AI use in this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[520px] text-left text-[13.5px]">
                  <thead className="um-dim text-[12.5px]">
                    <tr>
                      <th className="px-5 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">School</th>
                      <th className="px-3 py-2 text-right font-medium">Questions</th>
                      <th className="px-5 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--um-line-strong)]">
                    {data.topUsers.map((u) => (
                      <tr key={u.username}>
                        <td className="px-5 py-2.5">
                          <span className="font-medium">{u.username}</span>
                          <span className="um-dim ml-2 text-[12px]">
                            {u.role === "USER" ? (u.standard ? `Class ${u.standard}` : "Student") : u.role.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">{u.school || "—"}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{num(u.requests)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums" title={usd(u.costUsd)}>
                          {inr(u.costInr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="um-dim text-[12.5px]">
            Estimated from the AI tokens LearnMate used ({data.prices.model}), at ${data.prices.inputPerMTokUsd} per million input and $
            {data.prices.outputPerMTokUsd} per million output tokens, ₹{data.prices.usdToInr} per dollar. Search
            (embedding) costs and taxes are not included; check your Anthropic bill for exact amounts. Usage is recorded
            from the day this feature went live.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="um-card px-4 py-3">
      <p className="um-dim text-[12.5px]">{label}</p>
      <p className="um-display mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="um-dim text-[12px] tabular-nums">{hint}</p>}
    </div>
  );
}
