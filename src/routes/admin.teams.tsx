import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listTeams, upsertTeam, deleteTeam } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, Bell } from "lucide-react";
import { toast } from "sonner";
import { sendTestPush } from "@/lib/push.functions";

export const Route = createFileRoute("/admin/teams")({
  ssr: false,
  head: () => ({ meta: [{ title: "צוותים - פאנל ניהול" }] }),
  component: () => <AdminShell><Teams /></AdminShell>,
});

function Teams() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTeams);
  const upsertFn = useServerFn(upsertTeam);
  const deleteFn = useServerFn(deleteTeam);
  const testPushFn = useServerFn(sendTestPush);
  const { data: teams } = useQuery({ queryKey: ["admin-teams"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<any>(null);

  function newTeam() {
    setEditing({ name: "", pin: "", monthly_limit: 0, contact_phone: "", active: true });
  }
  async function save() {
    try {
      await upsertFn({ data: {
        id: editing.id,
        name: editing.name,
        pin: editing.pin,
        monthly_limit: Number(editing.monthly_limit),
        contact_phone: editing.contact_phone || null,
        active: !!editing.active,
      } });
      toast.success("נשמר"); setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-teams"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("למחוק צוות זה?")) return;
    try { await deleteFn({ data: { id } }); toast.success("נמחק"); qc.invalidateQueries({ queryKey: ["admin-teams"] }); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">צוותים</h1>
        <Button onClick={newTeam}><Plus className="w-4 h-4 ml-2" /> צוות חדש</Button>
      </div>

      {!teams?.length ? <Card className="p-12 text-center text-muted-foreground">אין צוותים</Card> :
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {teams.map((t: any) => {
            const pct = t.monthly_limit > 0 ? Math.min(100, (t.monthly_spent / t.monthly_limit) * 100) : 0;
            return (
              <Card key={t.id} className={`p-4 ${!t.active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Users className="w-5 h-5" /></div>
                    <div>
                      <div className="font-bold">{t.name}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">PIN: {t.pin}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" title="שלח התראת בדיקה" onClick={async () => {
                      try { const r = await testPushFn({ data: { pin: t.pin } }); toast.success(`נשלחו ${r.sent} התראות${r.removed ? ` (הוסרו ${r.removed} ישנות)` : ""}`); }
                      catch (e: any) { toast.error(e.message || "שגיאה"); }
                    }}><Bell className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ניצול חודשי</span>
                    <span>₪{Number(t.monthly_spent).toFixed(0)} / ₪{Number(t.monthly_limit).toFixed(0)}</span>
                  </div>
                  <Progress value={pct} />
                </div>
                {t.contact_phone && <div className="text-xs text-muted-foreground mt-2" dir="ltr">📞 {t.contact_phone}</div>}
              </Card>
            );
          })}
        </div>
      }

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "עריכת צוות" : "צוות חדש"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><label className="text-sm">שם הצוות</label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="text-sm">קוד PIN</label><Input value={editing.pin} onChange={(e) => setEditing({ ...editing, pin: e.target.value })} dir="ltr" /></div>
              <div><label className="text-sm">מסגרת חודשית (₪) — 0 = ללא מגבלה</label><Input type="number" value={editing.monthly_limit} onChange={(e) => setEditing({ ...editing, monthly_limit: e.target.value })} /></div>
              <div><label className="text-sm">טלפון ליצירת קשר (אופציונלי)</label><Input value={editing.contact_phone ?? ""} onChange={(e) => setEditing({ ...editing, contact_phone: e.target.value })} dir="ltr" /></div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><label className="text-sm">פעיל</label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            <Button onClick={save}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
