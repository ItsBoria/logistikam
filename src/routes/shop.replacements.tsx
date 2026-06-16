import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getReplacementShop,
  submitReplacementRequest,
  getTeamReplacementRequests,
  deleteReplacementRequest,
  editReplacementRequest,
} from "@/lib/replacements.functions";
import { getTeamSession } from "@/lib/team-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Minus, Loader2, Trash2, Replace, Pencil } from "lucide-react";
import { toast } from "sonner";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const Route = createFileRoute("/shop/replacements")({
  ssr: false,
  head: () => ({ meta: [{ title: "החלפות - מערכת הזמנות צוותים" }] }),
  component: ReplacementsPage,
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

function ReplacementsPage() {
  const navigate = useNavigate();
  const session = typeof window !== "undefined" ? getTeamSession() : null;
  useEffect(() => { if (!session) navigate({ to: "/", replace: true }); }, [session, navigate]);

  const fetchShop = useServerFn(getReplacementShop);
  const submitFn = useServerFn(submitReplacementRequest);
  const fetchHistory = useServerFn(getTeamReplacementRequests);
  const deleteReqFn = useServerFn(deleteReplacementRequest);
  const editReqFn = useServerFn(editReplacementRequest);

  const { data, isLoading, refetch } = useQuery({
    enabled: !!session,
    queryKey: ["replacement-shop", session?.pin],
    queryFn: () => fetchShop({ data: { pin: session!.pin } }),
  });
  const { data: history, refetch: refetchHistory } = useQuery({
    enabled: !!session,
    queryKey: ["replacement-history", session?.pin],
    queryFn: () => fetchHistory({ data: { pin: session!.pin } }),
  });

  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkout, setCheckout] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!session) return;
    try {
      const raw = localStorage.getItem(`team-contact:${session.pin}`);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.name) setName(v.name);
        if (v.phone) setPhone(v.phone);
      }
    } catch {}
  }, [session?.pin]);

  const products = data?.products ?? [];
  const itemCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  function setQty(id: string, q: number) {
    const v = Math.max(0, Math.min(99, q));
    setCart((c) => { const n = { ...c }; if (v === 0) delete n[id]; else n[id] = v; return n; });
  }

  async function submit() {
    if (!name || !phone) { toast.error("יש למלא שם וטלפון"); return; }
    setPlacing(true);
    try {
      const items = Object.entries(cart).map(([replacement_product_id, quantity]) => ({ replacement_product_id, quantity }));
      await submitFn({ data: { pin: session!.pin, items, contact_phone: phone, ordered_by_name: name, notes } });
      try { localStorage.setItem(`team-contact:${session!.pin}`, JSON.stringify({ name, phone })); } catch {}
      toast.success("בקשת ההחלפה נשלחה. תקבלו הודעה כשתהיה מוכנה לאיסוף");
      setCart({}); setCheckout(false); setNotes("");
      refetch(); refetchHistory();
    } catch (e: any) {
      toast.error(e.message || "שגיאה בשליחת הבקשה");
    } finally { setPlacing(false); }
  }

  const [editing, setEditing] = useState<any | null>(null);
  const [editQty, setEditQty] = useState<Record<string, number>>({});
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(req: any) {
    const initial: Record<string, number> = {};
    for (const it of (req.replacement_request_items ?? []) as any[]) {
      if (it.replacement_product_id) initial[it.replacement_product_id] = Number(it.quantity);
    }
    setEditQty(initial);
    setEditing(req);
  }
  function bumpEdit(id: string, delta: number) {
    setEditQty((m) => {
      const next = { ...m, [id]: Math.max(0, (m[id] ?? 0) + delta) };
      if (next[id] === 0) delete next[id];
      return next;
    });
  }
  async function saveEdit() {
    if (!editing || !session) return;
    const items = Object.entries(editQty).map(([replacement_product_id, quantity]) => ({ replacement_product_id, quantity }));
    if (items.length === 0) { toast.error("חייב להישאר לפחות פריט אחד"); return; }
    setSavingEdit(true);
    try {
      await editReqFn({ data: { pin: session.pin, request_id: editing.id, items } });
      toast.success("הבקשה עודכנה");
      setEditing(null);
      refetch(); refetchHistory();
    } catch (e: any) {
      toast.error(e.message || "שגיאה");
    } finally { setSavingEdit(false); }
  }
  async function handleDelete(id: string) {
    if (!session) return;
    if (!confirm("למחוק את בקשת ההחלפה?")) return;
    try {
      await deleteReqFn({ data: { pin: session.pin, request_id: id } });
      toast.success("הבקשה נמחקה");
      refetch(); refetchHistory();
    } catch (e: any) { toast.error(e.message || "שגיאה"); }
  }


  if (!session) return null;
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="bg-card border-b sticky top-0 z-30 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-lg flex items-center gap-2"><Replace className="w-5 h-5" /> החלפת פריט שבור</h1>
            <p className="text-xs text-muted-foreground">{data?.team.name} · ללא חיוב מתקציב</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCheckout(true)} disabled={itemCount === 0}>
            <ShoppingCart className="w-4 h-4 ml-2" /> סל ({itemCount})
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {products.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">אין פריטים זמינים להחלפה כרגע</Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p: any) => {
              const qty = cart[p.id] || 0;
              return (
                <Card key={p.id} className="overflow-hidden flex flex-col">
                  <div className="aspect-square bg-muted relative">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl">🔧</div>}
                    {p.category && <Badge variant="secondary" className="absolute top-2 right-2">{p.category}</Badge>}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-semibold leading-tight">{p.name}</h3>
                    {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                    <div className="mt-2 text-xs text-success">זמין להחלפה</div>
                    <div className="mt-3">
                      {qty === 0 ? (
                        <Button className="w-full h-11" onClick={() => setQty(p.id, 1)}>הוסף</Button>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQty(p.id, qty - 1)}><Minus className="w-5 h-5" /></Button>
                          <span className="font-bold text-lg tabular-nums">{qty}</span>
                          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => setQty(p.id, qty + 1)}><Plus className="w-5 h-5" /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* History */}
        <Card className="p-4">
          <h2 className="font-bold mb-3">בקשות החלפה אחרונות</h2>
          {(history?.requests ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">עדיין לא שלחת בקשות החלפה</p>
          ) : (
            <div className="space-y-3">
              {(history!.requests as any[]).map((r) => (
                <div key={r.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("he-IL")}</span>
                  </div>
                  <ul className="text-sm mt-1 list-disc pr-5">
                    {(r.replacement_request_items ?? []).map((it: any) => (
                      <li key={it.id}>{it.name} × {it.quantity}</li>
                    ))}
                  </ul>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">הערה: {r.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="h-20 sm:hidden" aria-hidden />
      </main>

      {itemCount > 0 && (
        <div className="sm:hidden fixed inset-x-0 z-50 bg-card border-t shadow-lg p-3 flex items-center gap-3" style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
          <div className="flex-1 text-xs text-muted-foreground">{itemCount} פריטים להחלפה</div>
          <Button className="h-12 px-6 text-base" onClick={() => setCheckout(true)}>
            <ShoppingCart className="w-5 h-5 ml-2" /> שליחת בקשה
          </Button>
        </div>
      )}

      <BottomTabBar pin={session?.pin} />

      <Dialog open={checkout} onOpenChange={setCheckout}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>בקשת החלפה</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {Object.entries(cart).map(([id, q]) => {
              const p: any = products.find((x: any) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="flex items-center justify-between gap-2 border-b pb-2">
                  <div className="flex-1 font-medium text-sm">{p.name}</div>
                  <div className="text-sm tabular-nums">× {q}</div>
                  <Button variant="ghost" size="icon" onClick={() => setQty(id, 0)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              );
            })}
          </div>
          <div className="space-y-3 pt-2">
            <Input placeholder="שם המבקש" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="טלפון" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            <Textarea placeholder="סיבת ההחלפה / הערות" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-muted-foreground">הבקשה תיכנס מיד להכנה. אין חיוב מתקציב. תקבלו הודעה כשהיא תהיה מוכנה לאיסוף.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckout(false)}>ביטול</Button>
            <Button onClick={submit} disabled={placing || itemCount === 0}>
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : "שליחת בקשה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
