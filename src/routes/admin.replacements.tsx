import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listReplacementRequests, updateReplacementStatus } from "@/lib/replacement-admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Bell, CheckCheck, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/replacements")({
  ssr: false,
  head: () => ({ meta: [{ title: "בקשות החלפה - פאנל ניהול" }] }),
  component: () => <AdminShell><Page /></AdminShell>,
});

const STATUS_LABEL: Record<string, string> = {
  preparing: "בהכנה",
  ready: "מוכן לאיסוף",
  done: "נאסף",
  cancelled: "בוטל",
};
const STATUS_COLOR: Record<string, string> = {
  preparing: "bg-warning text-warning-foreground",
  ready: "bg-primary text-primary-foreground",
  done: "bg-success text-success-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReplacementRequests);
  const updateFn = useServerFn(updateReplacementStatus);
  const [statusFilter, setStatusFilter] = useState<string>("preparing");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-replacements", statusFilter],
    queryFn: () => listFn({ data: { status: statusFilter === "all" ? null : (statusFilter as any) } }),
  });

  const [closing, setClosing] = useState<any | null>(null);
  const [returnBalai, setReturnBalai] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  function openClose(req: any) {
    const map: Record<string, boolean> = {};
    for (const it of req.replacement_request_items ?? []) map[it.id] = true;
    setReturnBalai(map);
    setClosing(req);
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-replacements"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  }

  async function markReady(id: string) {
    try {
      await updateFn({ data: { id, action: "ready" } });
      toast.success("נשלחה הודעה לצוות שהבקשה מוכנה");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
  }

  async function confirmDone() {
    setBusy(true);
    try {
      await updateFn({ data: { id: closing.id, action: "done", return_balai: returnBalai } });
      toast.success("הבקשה הושלמה");
      setClosing(null);
      invalidate();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function cancel(id: string) {
    if (!confirm("לבטל את הבקשה? המלאי יוחזר.")) return;
    try {
      await updateFn({ data: { id, action: "cancel" } });
      toast.success("הבקשה בוטלה והמלאי הוחזר");
      invalidate();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">בקשות החלפה</h1>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="preparing">בהכנה</SelectItem>
            <SelectItem value="ready">מוכן לאיסוף</SelectItem>
            <SelectItem value="done">נאסף</SelectItem>
            <SelectItem value="cancelled">בוטלו</SelectItem>
            <SelectItem value="all">הכל</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : !data?.length ? (
        <Card className="p-12 text-center text-muted-foreground">אין בקשות בסטטוס זה</Card>
      ) : (
        <div className="space-y-3">
          {(data as any[]).map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    <span className="font-bold">{r.teams?.name}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("he-IL")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.ordered_by_name} · {r.contact_phone}
                  </p>
                  <ul className="text-sm mt-2 list-disc pr-5">
                    {(r.replacement_request_items ?? []).map((it: any) => (
                      <li key={it.id}>{it.name} × {it.quantity}</li>
                    ))}
                  </ul>
                  {r.notes && <p className="text-sm mt-2 bg-muted p-2 rounded">הערה: {r.notes}</p>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {r.status === "preparing" && (
                    <>
                      <Button variant="outline" onClick={() => cancel(r.id)}><X className="w-4 h-4 ml-1" /> ביטול</Button>
                      <Button onClick={() => markReady(r.id)}><Bell className="w-4 h-4 ml-1" /> מוכן לאיסוף</Button>
                    </>
                  )}
                  {r.status === "ready" && (
                    <>
                      <Button variant="outline" onClick={() => cancel(r.id)}><X className="w-4 h-4 ml-1" /> ביטול</Button>
                      <Button onClick={() => openClose(r)}><CheckCheck className="w-4 h-4 ml-1" /> נאסף / סיום</Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!closing} onOpenChange={(o) => !o && setClosing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>סגירת בקשת החלפה</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">סמן לאילו פריטים הצוות החזיר את היחידה השבורה (תועבר לבלאי).</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(closing?.replacement_request_items ?? []).map((it: any) => (
              <label key={it.id} className="flex items-center gap-3 p-2 border rounded">
                <Checkbox
                  checked={returnBalai[it.id] ?? true}
                  onCheckedChange={(v) => setReturnBalai({ ...returnBalai, [it.id]: !!v })}
                />
                <span className="flex-1">{it.name} × {it.quantity}</span>
                <span className="text-xs text-muted-foreground">הוחזר פריט בלאי?</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosing(null)}>ביטול</Button>
            <Button onClick={confirmDone} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "סיום"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
