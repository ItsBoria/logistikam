import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import {
  listOrders, updateOrderStatus, listTeamsBasic, updateOrderItems,
  deleteOrder, deleteOldOrders, getOrderDetail, updateAdminNotes,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Download, Filter, X, Phone, User, Pencil, Plus, Minus, Trash2, Eraser,
  Search, FileText, FileType, CheckCircle2, PackageCheck, Truck, History, StickyNote, Info, ChevronDown,
  SlidersHorizontal, ChevronUp, Loader2, ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { downloadOrderInvoicePDF, downloadOrderInvoiceDOCX } from "@/lib/invoice";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { useHideOnScroll } from "@/hooks/use-scroll-direction";

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

type Preset = "all" | "today" | "week" | "awaiting" | "ready";
type SortKey = "date_desc" | "date_asc" | "total_desc" | "total_asc";
const FILTER_STORAGE_KEY = "admin-orders-filters-v2";
const SORT_LABEL: Record<SortKey, string> = {
  date_desc: "תאריך (חדש→ישן)",
  date_asc: "תאריך (ישן→חדש)",
  total_desc: "סכום (גבוה→נמוך)",
  total_asc: "סכום (נמוך→גבוה)",
};

function todayIso() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10);
}
function weekAgoIso() {
  const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10);
}

function OrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrders);
  const updateFn = useServerFn(updateOrderStatus);
  const teamsFn = useServerFn(listTeamsBasic);
  const updateItemsFn = useServerFn(updateOrderItems);
  const deleteOrderFn = useServerFn(deleteOrder);
  const deleteOldFn = useServerFn(deleteOldOrders);
  const detailFn = useServerFn(getOrderDetail);
  const notesFn = useServerFn(updateAdminNotes);

  const [teamId, setTeamId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [preset, setPreset] = useState<Preset>("all");
  const [editing, setEditing] = useState<any>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupBefore, setCleanupBefore] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [cleanupOnlyDone, setCleanupOnlyDone] = useState(true);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);
  const hiddenByScroll = useHideOnScroll(80);
  const collapsed = hiddenByScroll && !manualExpanded;

  // Load saved filters once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (raw) {
        const f = JSON.parse(raw);
        if (f.teamId) setTeamId(f.teamId);
        if (f.status) setStatus(f.status);
        if (f.from) setFrom(f.from);
        if (f.to) setTo(f.to);
        if (f.sort) setSort(f.sort);
      }
    } catch {}
  }, []);
  // Persist
  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ teamId, status, from, to, sort }));
  }, [teamId, status, from, to, sort]);

  // Debounce search input → committed search (250ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // When user scrolls back to top, drop manual-expand override
  useEffect(() => {
    if (!hiddenByScroll) setManualExpanded(false);
  }, [hiddenByScroll]);

  const { data: teams } = useQuery({ queryKey: ["admin-teams"], queryFn: () => teamsFn() });
  const { data: orders, isLoading, isFetching } = useQuery({
    queryKey: ["admin-orders", teamId, status, from, to, search],
    queryFn: () => listFn({ data: {
      team_id: teamId === "all" ? null : teamId,
      status: status === "all" ? null : status,
      from: from || null,
      to: to ? new Date(to + "T23:59:59").toISOString() : null,
      search: search || null,
    } }),
  });

  const sortedOrders = useMemo(() => {
    if (!orders) return orders;
    const arr = [...orders];
    arr.sort((a: any, b: any) => {
      switch (sort) {
        case "date_asc": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "total_desc": return Number(b.total) - Number(a.total);
        case "total_asc": return Number(a.total) - Number(b.total);
        case "date_desc":
        default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return arr;
  }, [orders, sort]);

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "all") { setStatus("all"); setFrom(""); setTo(""); }
    else if (p === "today") { setStatus("all"); setFrom(todayIso()); setTo(todayIso()); }
    else if (p === "week") { setStatus("all"); setFrom(weekAgoIso()); setTo(todayIso()); }
    else if (p === "awaiting") { setStatus("awaiting_approval"); setFrom(""); setTo(""); }
    else if (p === "ready") { setStatus("ready"); setFrom(""); setTo(""); }
  }

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
        id: it.id, product_id: it.product_id, name: it.name,
        price: Number(it.price), quantity: it.quantity,
      })),
    });
  }

  async function saveEdit() {
    if (!editing.items.length) { toast.error("חייב להישאר לפחות פריט אחד"); return; }
    try {
      await updateItemsFn({ data: {
        order_id: editing.order_id,
        items: editing.items.map((it: any) => ({
          product_id: it.product_id ?? null, name: it.name,
          price: Number(it.price), quantity: Number(it.quantity),
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
      "מס׳ הזמנה": o.id.slice(0, 8), "תאריך": new Date(o.created_at).toLocaleString("he-IL"),
      "צוות": o.teams?.name ?? "", "סטטוס": STATUS_LABEL[o.status] ?? o.status,
      "מזמין": o.ordered_by_name ?? "", "טלפון": o.contact_phone ?? "",
      "מוצר": it.name, "מחיר": Number(it.price), "כמות": it.quantity,
      "סכום שורה": Number(it.price) * it.quantity, "סה״כ הזמנה": Number(o.total),
      "הערות": o.notes ?? "",
    })));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "הזמנות");
    XLSX.writeFile(wb, `orders-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function downloadInvoice(o: any, fmt: "pdf" | "docx") {
    try {
      if (fmt === "pdf") await downloadOrderInvoicePDF(o);
      else await downloadOrderInvoiceDOCX(o);
    } catch (e: any) { toast.error(e.message ?? "שגיאה בייצוא"); }
  }

  function resetFilters() {
    setPreset("all"); setTeamId("all"); setStatus("all");
    setFrom(""); setTo(""); setSearchInput(""); setSearch(""); setSort("date_desc");
  }

  const teamName = (id: string) => teams?.find((t: any) => t.id === id)?.name ?? id;
  const activeFilters: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (teamId !== "all") activeFilters.push({ key: "team", label: `צוות: ${teamName(teamId)}`, onClear: () => setTeamId("all") });
  if (status !== "all") activeFilters.push({ key: "status", label: `סטטוס: ${STATUS_LABEL[status] ?? status}`, onClear: () => setStatus("all") });
  if (from) activeFilters.push({ key: "from", label: `מתאריך: ${from}`, onClear: () => { setPreset("all"); setFrom(""); } });
  if (to) activeFilters.push({ key: "to", label: `עד תאריך: ${to}`, onClear: () => { setPreset("all"); setTo(""); } });
  if (search) activeFilters.push({ key: "search", label: `חיפוש: ${search}`, onClear: () => { setSearchInput(""); setSearch(""); } });
  if (sort !== "date_desc") activeFilters.push({ key: "sort", label: `מיון: ${SORT_LABEL[sort]}`, onClear: () => setSort("date_desc") });
  const activeCount = activeFilters.length;
  const loading = isLoading || isFetching;


  const totalSum = useMemo(() => (orders ?? []).reduce((s, o: any) => s + Number(o.total), 0), [orders]);
  const editTotal = useMemo(() => editing?.items.reduce((s: number, it: any) => s + Number(it.price) * Number(it.quantity), 0) ?? 0, [editing]);

  function quickActionsFor(s: string): Array<{ label: string; to: string; icon: any; variant?: "default" | "outline" }> {
    if (s === "pending" || s === "awaiting_approval") return [{ label: "אישור", to: "approved", icon: CheckCircle2, variant: "default" }];
    if (s === "approved") return [{ label: "בהכנה", to: "preparing", icon: Truck, variant: "outline" }];
    if (s === "preparing") return [{ label: "מוכן", to: "ready", icon: PackageCheck, variant: "default" }];
    if (s === "ready") return [{ label: "הושלם", to: "completed", icon: CheckCircle2, variant: "default" }];
    return [];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">הזמנות</h1>
          <p className="text-sm text-muted-foreground">{orders?.length ?? 0} הזמנות · סה״כ ₪{totalSum.toFixed(0)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setCleanupOpen(true)}>
            <Eraser className="w-4 h-4 ml-2" /> מחיקת הזמנות ישנות
          </Button>
          <Button onClick={exportExcel} disabled={!orders?.length}>
            <Download className="w-4 h-4 ml-2" /> ייצוא לאקסל
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3 sticky top-2 z-10 bg-card/95 backdrop-blur">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            ["all", "הכל"], ["today", "היום"], ["week", "השבוע"],
            ["awaiting", "ממתינות לאישור"], ["ready", "מוכנות לאיסוף"],
          ] as Array<[Preset, string]>).map(([k, label]) => (
            <Button key={k} size="sm" variant={preset === k ? "default" : "outline"} onClick={() => applyPreset(k)}>
              {label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <SearchInput
              containerClassName="max-w-none"
              placeholder="חפש לפי מס׳, צוות, מזמין, טלפון או מוצר"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch("")}
            />
          </div>
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
          <Input type="date" value={from} onChange={(e) => { setPreset("all"); setFrom(e.target.value); }} />
          <Input type="date" value={to} onChange={(e) => { setPreset("all"); setTo(e.target.value); }} />
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Filter className="w-3 h-3" /> סינון נשמר אוטומטית בדפדפן</span>
          <Button variant="ghost" size="sm" onClick={resetFilters}><X className="w-3 h-3 ml-1" /> נקה</Button>
        </div>
      </Card>

      {isLoading ? <Card className="p-12 text-center">טוען...</Card> :
        !orders?.length ? <Card className="p-12 text-center text-muted-foreground">אין הזמנות</Card> :
        <Accordion type="multiple" className="space-y-2">
          {orders.map((o: any) => {
            const ageH = (Date.now() - new Date(o.created_at).getTime()) / 3600000;
            const stuck = (o.status === "awaiting_approval" && ageH > 24) || (o.status === "ready" && ageH > 48);
            return (
            <AccordionItem key={o.id} value={o.id} className={`border rounded-lg bg-card px-4 ${stuck ? "border-warning border-2" : ""}`}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex-1 flex flex-wrap items-start justify-between gap-3 pr-2">
                  <div className="flex-1 min-w-[200px] text-right">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{o.teams?.name}</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                      <span className="text-xs text-muted-foreground">#{o.id.slice(0, 8)}</span>
                      {stuck && <span className="text-xs text-warning-foreground">⏱ תקועה</span>}
                      {o.admin_notes && <span className="text-xs flex items-center gap-1 text-primary"><StickyNote className="w-3 h-3" /> הערת מנהל</span>}
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
                  {o.notes && <div className="text-sm bg-muted p-2 rounded">הערות צוות: {o.notes}</div>}

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Quick actions */}
                    {quickActionsFor(o.status).map((qa) => (
                      <Button key={qa.to} size="sm" variant={qa.variant ?? "default"} onClick={() => changeStatus(o.id, qa.to)}>
                        <qa.icon className="w-4 h-4 ml-1" /> {qa.label}
                      </Button>
                    ))}
                    {/* Status select */}
                    <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)}>
                      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    <Button variant="outline" size="sm" onClick={() => setDetailOrderId(o.id)}>
                      <Info className="w-4 h-4 ml-1" /> פרטים
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => startEdit(o)}>
                      <Pencil className="w-4 h-4 ml-1" /> ערוך פריטים
                    </Button>

                    {/* Invoice */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 ml-1" /> חשבונית <ChevronDown className="w-3 h-3 mr-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => downloadInvoice(o, "pdf")}>
                          <FileText className="w-4 h-4 ml-2" /> PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadInvoice(o, "docx")}>
                          <FileType className="w-4 h-4 ml-2" /> Word (DOCX)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="ghost" size="sm" onClick={() => removeOrder(o.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4 ml-1" /> מחק
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
          })}
        </Accordion>
      }

      {/* Detail drawer */}
      <OrderDetailDrawer
        orderId={detailOrderId}
        onClose={() => setDetailOrderId(null)}
        fetchFn={detailFn as any}
        notesFn={notesFn as any}
      />

      {/* Edit dialog */}
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

      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>מחיקת הזמנות ישנות</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">פעולה זו תמחק לצמיתות את כל ההזמנות שנוצרו לפני התאריך שתבחר.</p>
            <div>
              <label className="text-sm">מחק הזמנות לפני</label>
              <Input type="date" value={cleanupBefore} onChange={(e) => setCleanupBefore(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cleanupOnlyDone} onChange={(e) => setCleanupOnlyDone(e.target.checked)} />
              מחק רק הזמנות שהושלמו או בוטלו
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupOpen(false)} disabled={cleanupBusy}>ביטול</Button>
            <Button variant="destructive" onClick={runCleanup} disabled={cleanupBusy}>
              {cleanupBusy ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderDetailDrawer({ orderId, onClose, fetchFn, notesFn }: {
  orderId: string | null; onClose: () => void;
  fetchFn: (args: { data: { id: string } }) => Promise<any>;
  notesFn: (args: { data: { id: string; admin_notes: string | null } }) => Promise<any>;
}) {
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: () => fetchFn({ data: { id: orderId! } }),
    enabled: !!orderId,
  });

  useEffect(() => {
    if (data?.order) setNoteDraft(data.order.admin_notes ?? "");
  }, [data?.order?.id]);

  async function saveNote() {
    if (!orderId) return;
    setSaving(true);
    try {
      await notesFn({ data: { id: orderId, admin_notes: noteDraft || null } });
      toast.success("ההערה נשמרה");
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Sheet open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader><SheetTitle>פרטי הזמנה</SheetTitle></SheetHeader>
        {isLoading || !data ? (
          <div className="py-10 text-center text-sm text-muted-foreground">טוען...</div>
        ) : (
          <div className="space-y-4 mt-4">
            <Card className="p-3 space-y-1 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">צוות</span><span className="font-bold">{data.order.teams?.name}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">סטטוס</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOR[data.order.status]}`}>{STATUS_LABEL[data.order.status] ?? data.order.status}</span>
              </div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">מס׳</span><span dir="ltr">#{data.order.id.slice(0, 8)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">נוצרה</span><span>{new Date(data.order.created_at).toLocaleString("he-IL")}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">מזמין</span><span>{data.order.ordered_by_name}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">טלפון</span><span dir="ltr">{data.order.contact_phone}</span></div>
              <div className="flex items-center justify-between border-t pt-1 mt-1"><span className="text-muted-foreground">סה״כ</span><span className="font-bold">₪{Number(data.order.total).toFixed(2)}</span></div>
            </Card>

            {data.order.teams?.monthly_limit > 0 && (
              <Card className="p-3 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-muted-foreground">תקציב חודשי של הצוות</span>
                  <span>₪{Number(data.monthSpent).toFixed(0)} / ₪{Number(data.order.teams.monthly_limit).toFixed(0)}</span>
                </div>
                <div className="h-2 rounded bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(100, (data.monthSpent / data.order.teams.monthly_limit) * 100)}%` }} />
                </div>
              </Card>
            )}

            <Card className="p-3">
              <h3 className="text-sm font-bold mb-2">פריטים</h3>
              <div className="divide-y text-sm">
                {(data.order.order_items as any[]).map((it) => (
                  <div key={it.id} className="flex justify-between py-1.5">
                    <span>{it.name} × {it.quantity}</span>
                    <span dir="ltr">₪{(Number(it.price) * it.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-3 space-y-2">
              <h3 className="text-sm font-bold flex items-center gap-2"><StickyNote className="w-4 h-4" /> הערה פנימית למנהלים</h3>
              <p className="text-xs text-muted-foreground">לא נראית לצוות. שמורה רק לעיני הצוות הניהולי.</p>
              <Textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={3} placeholder="לדוגמה: לקוח התקשר וביקש לעכב..." />
              <Button size="sm" onClick={saveNote} disabled={saving}>{saving ? "שומר..." : "שמור הערה"}</Button>
            </Card>

            <Card className="p-3">
              <h3 className="text-sm font-bold flex items-center gap-2 mb-3"><History className="w-4 h-4" /> ציר זמן סטטוס</h3>
              {data.history.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין רשומות.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {data.history.map((h: any) => (
                    <li key={h.id} className="flex items-start gap-2">
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {h.from_status && <>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${STATUS_COLOR[h.from_status] ?? ""}`}>{STATUS_LABEL[h.from_status] ?? h.from_status}</span>
                            <span className="text-muted-foreground text-xs">→</span>
                          </>}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOR[h.to_status] ?? ""}`}>{STATUS_LABEL[h.to_status] ?? h.to_status}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Date(h.created_at).toLocaleString("he-IL")}
                          {h.changed_by_name && ` · ${h.changed_by_name}`}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
