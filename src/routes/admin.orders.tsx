import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listOrders, updateOrderStatus, listTeams, updateOrderItems, deleteOrder, deleteOldOrders } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Download, Filter, X, Phone, User, Pencil, Plus, Minus, Trash2, Eraser } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/admin/orders")({
  ssr: false,
  head: () => ({ meta: [{ title: "הזמנות - פאנל ניהול" }] }),
  component: () => <AdminShell><OrdersPage /></AdminShell>,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "ממתינה",
  awaiting_approval: "ממתינה לאישור",
  approved: "אושרה",
  preparing: "בהכנה",
  ready: "מוכנה לאיסוף",
  completed: "הושלמה",
  cancelled: "בוטלה",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  awaiting_approval: "bg-warning text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  preparing: "bg-primary/15 text-primary",
  ready: "bg-success text-success-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

function OrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const teamsFn = useServerFn(listTeams);
  const updateItemsFn = useServerFn(updateOrderItems);
  const deleteOrderFn = useServerFn(deleteOrder);
  const deleteOldFn = useServerFn(deleteOldOrders);

  const [teamId, setTeamId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBefore, setCleanupBefore] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [cleanupOnlyDone, setCleanupOnlyDone] = useState(true);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const { data: teams } = useQuery({ queryKey: ["admin-teams"], queryFn: () => teamsFn() });
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders", teamId, status, from, to],
    queryFn: () => listFn({ data: {
      team_id: teamId === "all" ? null : teamId,
      status: status === "all" ? null : status,
      from: from || null,
      to: to ? new Date(to + "T23:59:59").toISOString() : null,
    } }),
  });

  async function changeStatus(id: string, s: string) {
    try {
      await updateFn({ data: { id, status: s as any } });
      toast.success("הסטטוס עודכן");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: any) { toast.error(e.message); }
  }

  function startEdit(o: any) {
    setEditing({
      order_id: o.id,
      notes: o.notes ?? "",
      items: (o.order_items as any[]).map(it => ({
        id: it.id,
        product_id: it.product_id,
        name: it.name,
        price: Number(it.price),
        quantity: it.quantity,
      })),
    });
  }

  async function saveEdit() {
    if (!editing.items.length) { toast.error("חייב להישאר לפחות פריט אחד"); return; }
    try {
      await updateItemsFn({ data: {
        order_id: editing.order_id,
        items: editing.items.map((it: any) => ({
          product_id: it.product_id ?? null,
          name: it.name,
          price: Number(it.price),
          quantity: Number(it.quantity),
        })),
        notes: editing.notes || null,
      } });
      toast.success("ההזמנה עודכנה");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function removeOrder(id: string) {
    if (!confirm("למחוק את ההזמנה לצמיתות?")) return;
    try {
      await deleteOrderFn({ data: { id } });
      toast.success("ההזמנה נמחקה");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function runCleanup() {
    setCleanupBusy(true);
    try {
      const iso = new Date(cleanupBefore + "T00:00:00").toISOString();
      const res = await deleteOldFn({ data: { before: iso, only_completed: cleanupOnlyDone } });
      toast.success(`נמחקו ${res.deleted} הזמנות`);
      setCleanupOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setCleanupBusy(false); }
  }

  function exportExcel() {
    if (!orders?.length) return;
    const rows = orders.flatMap((o: any) => (o.order_items as any[]).map(it => ({
      "מס׳ הזמנה": o.id.slice(0, 8),
      "תאריך": new Date(o.created_at).toLocaleString("he-IL"),
      "צוות": o.teams?.name ?? "",
      "סטטוס": STATUS_LABEL[o.status] ?? o.status,
      "מזמין": o.ordered_by_name ?? "",
      "טלפון": o.contact_phone ?? "",
      "מוצר": it.name,
      "מחיר": Number(it.price),
      "כמות": it.quantity,
      "סכום שורה": Number(it.price) * it.quantity,
      "סה״כ הזמנה": Number(o.total),
      "הערות": o.notes ?? "",
    })));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "הזמנות");
    XLSX.writeFile(wb, `orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function resetFilters() { setTeamId("all"); setStatus("all"); setFrom(""); setTo(""); }

  const totalSum = useMemo(() => (orders ?? []).reduce((s, o: any) => s + Number(o.total), 0), [orders]);
  const editTotal = useMemo(() => editing?.items.reduce((s: number, it: any) => s + Number(it.price) * Number(it.quantity), 0) ?? 0, [editing]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">הזמנות</h1>
          <p className="text-sm text-muted-foreground">{orders?.length ?? 0} הזמנות · סה״כ ₪{totalSum.toFixed(0)}</p>
        </div>
        <Button onClick={exportExcel} disabled={!orders?.length}>
          <Download className="w-4 h-4 ml-2" /> ייצוא לאקסל
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground"><Filter className="w-4 h-4" /> סינון</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger><SelectValue placeholder="צוות" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הצוותים</SelectItem>
              {teams?.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="סטטוס" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="outline" onClick={resetFilters}><X className="w-4 h-4 ml-2" /> נקה</Button>
        </div>
      </Card>

      {isLoading ? <Card className="p-12 text-center">טוען...</Card> :
        !orders?.length ? <Card className="p-12 text-center text-muted-foreground">אין הזמנות</Card> :
        <Accordion type="multiple" className="space-y-2">
          {orders.map((o: any) => (
            <AccordionItem key={o.id} value={o.id} className="border rounded-lg bg-card px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex-1 flex flex-wrap items-start justify-between gap-3 pr-2">
                  <div className="flex-1 min-w-[200px] text-right">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{o.teams?.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                      <span className="text-xs text-muted-foreground">#{o.id.slice(0, 8)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(o.created_at).toLocaleString("he-IL")}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{o.ordered_by_name}</span>
                      <span className="flex items-center gap-1" dir="ltr"><Phone className="w-3 h-3" />{o.contact_phone}</span>
                      <span>{(o.order_items as any[]).length} פריטים</span>
                    </div>
                  </div>
                  <div className="text-xl font-bold">₪{Number(o.total).toFixed(0)}</div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3 pt-2">
                  <div className="border rounded divide-y">
                    {(o.order_items as any[]).map(it => (
                      <div key={it.id} className="flex justify-between p-2 text-sm">
                        <span>{it.name} × {it.quantity}</span>
                        <span>₪{(Number(it.price) * it.quantity).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                  {o.notes && <div className="text-sm bg-muted p-2 rounded">הערות: {o.notes}</div>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => startEdit(o)}>
                      <Pencil className="w-4 h-4 ml-1" /> ערוך פריטים
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      }

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>עריכת הזמנה</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-2">
                {editing.items.map((it: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 border rounded p-2">
                    <Input className="flex-1" value={it.name}
                      onChange={(e) => setEditing({ ...editing, items: editing.items.map((x: any, i: number) => i === idx ? { ...x, name: e.target.value } : x) })} />
                    <Input className="w-24" type="number" step="0.01" value={it.price}
                      onChange={(e) => setEditing({ ...editing, items: editing.items.map((x: any, i: number) => i === idx ? { ...x, price: e.target.value } : x) })} />
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" onClick={() => setEditing({ ...editing, items: editing.items.map((x: any, i: number) => i === idx ? { ...x, quantity: Math.max(1, Number(x.quantity) - 1) } : x) })}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input className="w-14 text-center" type="number" value={it.quantity}
                        onChange={(e) => setEditing({ ...editing, items: editing.items.map((x: any, i: number) => i === idx ? { ...x, quantity: e.target.value } : x) })} />
                      <Button variant="outline" size="icon" onClick={() => setEditing({ ...editing, items: editing.items.map((x: any, i: number) => i === idx ? { ...x, quantity: Number(x.quantity) + 1 } : x) })}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setEditing({ ...editing, items: editing.items.filter((_: any, i: number) => i !== idx) })}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setEditing({ ...editing, items: [...editing.items, { name: "", price: 0, quantity: 1, product_id: null }] })}>
                  <Plus className="w-4 h-4 ml-2" /> פריט חדש
                </Button>
              </div>
              <div>
                <label className="text-sm">הערות</label>
                <Textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>סה"כ חדש</span><span>₪{editTotal.toFixed(0)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            <Button onClick={saveEdit}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
