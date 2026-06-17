import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronRight, ChevronLeft, Plus, Trash2, Pencil, Loader2, FileText, FileType,
  Lock, Unlock, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMissionWeek, upsertMission, deleteMission, toggleMissionDone,
  updateWeekNotes, signMissionWeek, reopenMissionWeek,
  type MissionRow,
} from "@/lib/missions.functions";
import { downloadWeeklyPDF, downloadWeeklyDOCX, isoWeekToRange } from "@/lib/weekly-export";

export const Route = createFileRoute("/admin/calendar")({
  ssr: false,
  head: () => ({ meta: [{ title: "תכנית שבועית - פאנל" }] }),
  component: () => <AdminShell adminOnly><Calendar /></AdminShell>,
});

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function addWeeks(year: number, week: number, delta: number): { year: number; week: number } {
  const range = isoWeekToRange(year, week);
  const moved = new Date(range.start);
  moved.setUTCDate(moved.getUTCDate() + delta * 7 + 1); // +1 so we land mid-week
  return getISOWeek(moved);
}

function Calendar() {
  const qc = useQueryClient();
  const today = useMemo(() => getISOWeek(new Date()), []);
  const [year, setYear] = useState(today.year);
  const [week, setWeek] = useState(today.week);
  const [showSat, setShowSat] = useState(false);

  const getFn = useServerFn(getMissionWeek);
  const { data, isLoading } = useQuery({
    queryKey: ["mission-week", year, week],
    queryFn: () => getFn({ data: { year, week } }),
  });

  const upsertFn = useServerFn(upsertMission);
  const delFn = useServerFn(deleteMission);
  const toggleFn = useServerFn(toggleMissionDone);
  const notesFn = useServerFn(updateWeekNotes);
  const signFn = useServerFn(signMissionWeek);
  const reopenFn = useServerFn(reopenMissionWeek);

  const [editor, setEditor] = useState<{ open: boolean; day: number; mission?: MissionRow }>({ open: false, day: 0 });
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const [notesDraft, setNotesDraft] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  const [authorName, setAuthorName] = useState("");
  const [approverName, setApproverName] = useState("");

  useEffect(() => {
    if (data?.week) {
      setNotesDraft(data.week.notes ?? "");
      setNotesDirty(false);
    }
  }, [data?.week?.id, data?.week?.notes]);

  const range = useMemo(() => isoWeekToRange(year, week), [year, week]);
  const days = showSat ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
  const grouped: Record<number, MissionRow[]> = {};
  (data?.missions ?? []).forEach((m) => { (grouped[m.day_of_week] ??= []).push(m); });

  const locked = !!data?.week?.locked;

  function openCreate(day: number) {
    setEditor({ open: true, day });
    setTitle(""); setDetails("");
  }
  function openEdit(m: MissionRow) {
    setEditor({ open: true, day: m.day_of_week, mission: m });
    setTitle(m.title); setDetails(m.details ?? "");
  }
  async function saveMission() {
    if (!data?.week || !title.trim()) return;
    setSaving(true);
    try {
      await upsertFn({ data: {
        id: editor.mission?.id, week_id: data.week.id, day_of_week: editor.day,
        title: title.trim(), details: details.trim() || null,
      }});
      setEditor({ open: false, day: 0 });
      qc.invalidateQueries({ queryKey: ["mission-week", year, week] });
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  async function removeMission(id: string) {
    if (!confirm("למחוק משימה?")) return;
    try { await delFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["mission-week", year, week] }); }
    catch (e: any) { toast.error(e.message); }
  }
  async function toggleDone(m: MissionRow) {
    try { await toggleFn({ data: { id: m.id, done: !m.done } }); qc.invalidateQueries({ queryKey: ["mission-week", year, week] }); }
    catch (e: any) { toast.error(e.message); }
  }
  async function saveNotes() {
    if (!data?.week) return;
    try { await notesFn({ data: { week_id: data.week.id, notes: notesDraft } }); setNotesDirty(false); toast.success("נשמר"); }
    catch (e: any) { toast.error(e.message); }
  }
  async function sign(role: "author" | "approver") {
    if (!data?.week) return;
    const name = (role === "author" ? authorName : approverName).trim();
    if (!name) { toast.error("הזן שם לחתימה"); return; }
    try {
      await signFn({ data: { week_id: data.week.id, role, signature_name: name } });
      qc.invalidateQueries({ queryKey: ["mission-week", year, week] });
      toast.success("נחתם");
    } catch (e: any) { toast.error(e.message); }
  }
  async function reopen() {
    if (!data?.week || !confirm("לפתוח את השבוע מחדש ולמחוק חתימות?")) return;
    try { await reopenFn({ data: { week_id: data.week.id } }); qc.invalidateQueries({ queryKey: ["mission-week", year, week] }); }
    catch (e: any) { toast.error(e.message); }
  }

  async function exportPdf() {
    if (!data) return;
    try { await downloadWeeklyPDF(data.week, data.missions); } catch (e: any) { toast.error(e.message); }
  }
  async function exportDocx() {
    if (!data) return;
    try { await downloadWeeklyDOCX(data.week, data.missions); } catch (e: any) { toast.error(e.message); }
  }

  function step(delta: number) {
    const next = addWeeks(year, week, delta);
    setYear(next.year); setWeek(next.week);
  }
  function goToday() { setYear(today.year); setWeek(today.week); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">תכנית שבועית</h1>
          <p className="text-sm text-muted-foreground">
            שבוע {week} · {range.start.toLocaleDateString("he-IL")} – {range.end.toLocaleDateString("he-IL")} · {year}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => step(-1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>השבוע</Button>
          <Button variant="outline" size="sm" onClick={() => step(1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setShowSat((v) => !v)}>
            {showSat ? "הסתר שבת" : "הצג שבת"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm"><FileText className="w-4 h-4 ml-1" />ייצוא</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportPdf}><FileText className="w-4 h-4 ml-2" />PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={exportDocx}><FileType className="w-4 h-4 ml-2" />DOCX</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {locked && (
        <Card className="p-3 flex items-center justify-between gap-3 bg-emerald-500/10 border-emerald-500/30">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="w-4 h-4 text-emerald-700" />
            <span className="font-medium">השבוע נחתם ונעול.</span>
            <span className="text-muted-foreground">
              {data?.week.author_signature_name ? `רכז: ${data.week.author_signature_name} · ` : ""}
              {data?.week.approver_signature_name ? `מאשר: ${data.week.approver_signature_name}` : ""}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={reopen}><Unlock className="w-4 h-4 ml-1" />פתח מחדש</Button>
        </Card>
      )}

      {isLoading || !data ? (
        <Card className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {days.map((d) => {
            const date = new Date(range.start);
            date.setUTCDate(range.start.getUTCDate() + d);
            const list = grouped[d] ?? [];
            return (
              <Card key={d} className="p-3 flex flex-col gap-2 min-h-[180px]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm">{DAY_NAMES[d]}</div>
                    <div className="text-xs text-muted-foreground">{date.toLocaleDateString("he-IL")}</div>
                  </div>
                  {!locked && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openCreate(d)}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {list.length === 0 && <div className="text-xs text-muted-foreground/70 py-4 text-center">אין משימות</div>}
                  {list.map((m) => (
                    <div key={m.id} className={`group rounded-md p-2 text-xs border bg-card ${m.done ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleDone(m)}
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${m.done ? "bg-emerald-600 border-emerald-600" : "border-muted-foreground/40"}`}
                          aria-label="סמן כבוצע"
                        >
                          {m.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium ${m.done ? "line-through" : ""}`}>{m.title}</div>
                          {m.details && <div className="text-muted-foreground text-[11px] mt-0.5 whitespace-pre-wrap break-words">{m.details}</div>}
                        </div>
                        {!locked && (
                          <div className="opacity-0 group-hover:opacity-100 transition flex gap-0.5">
                            <button onClick={() => openEdit(m)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => removeMission(m.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Notes + signatures */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-3 md:col-span-1">
            <div className="text-sm font-semibold mb-2">הערות שבועיות</div>
            <Textarea
              rows={5}
              value={notesDraft}
              disabled={locked}
              onChange={(e) => { setNotesDraft(e.target.value); setNotesDirty(true); }}
              placeholder="הערות, סיכומים, יעדים..."
            />
            {notesDirty && !locked && (
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={saveNotes}>שמור הערות</Button>
              </div>
            )}
          </Card>

          <Card className="p-3">
            <div className="text-sm font-semibold mb-2">חתימת רכז השבוע</div>
            {data.week.author_signed_at ? (
              <div className="text-sm">
                <div className="font-medium">{data.week.author_signature_name}</div>
                <div className="text-xs text-muted-foreground">{new Date(data.week.author_signed_at).toLocaleString("he-IL")}</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="שם הרכז" />
                <Button size="sm" onClick={() => sign("author")}>חתום כרכז</Button>
              </div>
            )}
          </Card>

          <Card className="p-3">
            <div className="text-sm font-semibold mb-2">אישור מנהל בכיר</div>
            {data.week.approver_signed_at ? (
              <div className="text-sm">
                <div className="font-medium">{data.week.approver_signature_name}</div>
                <div className="text-xs text-muted-foreground">{new Date(data.week.approver_signed_at).toLocaleString("he-IL")}</div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input value={approverName} onChange={(e) => setApproverName(e.target.value)} placeholder="שם המנהל" />
                <Button size="sm" onClick={() => sign("approver")}>אשר ונעל את השבוע</Button>
              </div>
            )}
          </Card>
        </div>
      )}

      <Dialog open={editor.open} onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editor.mission ? "עריכת משימה" : `משימה חדשה · ${DAY_NAMES[editor.day]}`}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת המשימה" autoFocus />
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="פרטים (אופציונלי)" rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor({ open: false, day: 0 })}>ביטול</Button>
            <Button onClick={saveMission} disabled={saving || !title.trim()}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
