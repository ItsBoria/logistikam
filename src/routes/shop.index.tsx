import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getShopData, placeOrder } from "@/lib/team.functions";
import { PushToggle } from "@/components/push-toggle";

import { getTeamSession, setTeamSession } from "@/lib/team-session";
import { VAT_LABEL, formatCurrency } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Minus, LogOut, AlertTriangle, Loader2, Trash2, Search, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/")({
  ssr: false,
  head: () => ({ meta: [{ title: "חנות - מערכת הזמנות צוותים" }] }),
  component: Shop,
});

type CartMap = Record<string, number>;


function Shop() {
  const navigate = useNavigate();
  const session = typeof window !== "undefined" ? getTeamSession() : null;
  useEffect(() => { if (!session) navigate({ to: "/", replace: true }); }, [session, navigate]);

  const fetchShop = useServerFn(getShopData);
  const orderFn = useServerFn(placeOrder);

  const { data, isLoading, refetch } = useQuery({
    enabled: !!session,
    queryKey: ["shop", session?.pin],
    queryFn: () => fetchShop({ data: { pin: session!.pin } }),
  });

  const [cart, setCart] = useState<CartMap>({});
  const [checkout, setCheckout] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  // Prefill contact info from previous orders (per-team) and any reorder cart
  useEffect(() => {
    if (!session) return;
    try {
      const k = `team-contact:${session.pin}`;
      const raw = localStorage.getItem(k);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.name) setName(v.name);
        if (v.phone) setPhone(v.phone);
      }
      const prefillKey = `prefill-cart:${session.pin}`;
      const prefill = sessionStorage.getItem(prefillKey);
      if (prefill) {
        sessionStorage.removeItem(prefillKey);
        const items: Array<{ product_id: string; quantity: number }> = JSON.parse(prefill);
        const next: CartMap = {};
        for (const it of items) next[it.product_id] = it.quantity;
        setCart(next);
      }
    } catch {}
  }, [session?.pin]);

  // search/filter
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);



  const products = data?.products ?? [];

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p: any) => p.category && s.add(p.category));
    return Array.from(s).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p: any) => {
      if (category !== "all" && p.category !== category) return false;
      if (inStockOnly && p.stock <= 0) return false;
      if (q && !(`${p.name} ${p.description ?? ""}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [products, search, category, inStockOnly]);

  const total = useMemo(() => products.reduce((s: number, p: any) => s + Number(p.price) * (cart[p.id] || 0), 0), [products, cart]);
  const itemCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  const limit = Number(data?.team.monthly_limit ?? 0);
  const spent = Number(data?.spent ?? 0);
  const remaining = limit > 0 ? limit - spent : Infinity;
  const willExceed = limit > 0 && (spent + total) > limit;

  function setQty(id: string, q: number, max: number) {
    const v = Math.max(0, Math.min(max, q));
    setCart(c => { const n = { ...c }; if (v === 0) delete n[id]; else n[id] = v; return n; });
  }

  async function submitOrder() {
    if (!phone || !name) { toast.error("יש למלא שם וטלפון"); return; }
    setPlacing(true);
    try {
      const items = Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity }));
      const res = await orderFn({ data: { pin: session!.pin, items, notes, contact_phone: phone, ordered_by_name: name } });
      toast.success(res.requires_approval
        ? "ההזמנה נשלחה ומחכה לאישור מנהל (חריגה ממסגרת)"
        : "ההזמנה נשלחה בהצלחה!");
      setCart({}); setCheckout(false); setNotes("");
      refetch();
    } catch (e: any) {
      toast.error(e.message || "שגיאה בשליחת הזמנה");
    } finally { setPlacing(false); }
  }


  function logout() { setTeamSession(null); navigate({ to: "/" }); }

  if (!session) return null;
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="bg-card border-b sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-bold text-lg">{data?.team.name}</h1>
            <p className="text-xs text-muted-foreground">
              {limit > 0 ? <>נוצל: {formatCurrency(spent)} / {formatCurrency(limit)} · נותר {formatCurrency(Math.max(0, remaining))}</> : "ללא מגבלת חודש"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link to="/shop/orders"><ClipboardList className="w-4 h-4 ml-2" /> ההזמנות שלי</Link>
            </Button>
            <PushToggle pin={session!.pin} />
            <Button variant="outline" size="sm" onClick={() => setCheckout(true)} disabled={itemCount === 0}>
              <ShoppingCart className="w-4 h-4 ml-2" /> סל ({itemCount})
            </Button>
            <Button variant="ghost" size="sm" onClick={logout}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
        {willExceed && (
          <div className="bg-warning/15 text-warning-foreground text-sm px-4 py-2 flex items-center gap-2 justify-center">
            <AlertTriangle className="w-4 h-4" /> ההזמנה הנוכחית חורגת מהמסגרת החודשית ותדרוש אישור מנהל
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4">
        <Card className="p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pr-10" placeholder="חיפוש מוצר..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {categories.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקטגוריות</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <Switch checked={inStockOnly} onCheckedChange={setInStockOnly} />
            במלאי בלבד
          </label>
        </Card>

        {filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">לא נמצאו מוצרים</Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p: any) => {
              const qty = cart[p.id] || 0;
              return (
                <Card key={p.id} className="overflow-hidden flex flex-col">
                  <div className="aspect-square bg-muted relative">
                    {p.image_url
                      ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-3xl">📦</div>}
                    {p.category && <Badge variant="secondary" className="absolute top-2 right-2">{p.category}</Badge>}
                  </div>
                  <div className="p-3 flex-1 flex flex-col">
                    <h3 className="font-semibold leading-tight">{p.name}</h3>
                    {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold text-lg">{formatCurrency(Number(p.price))}</div>
                        <div className="text-[11px] text-muted-foreground">{VAT_LABEL}</div>
                      </div>
                      <span className="text-xs text-muted-foreground">מלאי: {p.stock}</span>
                    </div>
                    <div className="mt-3">
                      {qty === 0 ? (
                        <Button className="w-full" size="sm" disabled={p.stock === 0} onClick={() => setQty(p.id, 1, p.stock)}>
                          {p.stock === 0 ? "אזל" : "הוסף"}
                        </Button>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <Button variant="outline" size="icon" onClick={() => setQty(p.id, qty - 1, p.stock)}><Minus className="w-4 h-4" /></Button>
                          <span className="font-semibold">{qty}</span>
                          <Button variant="outline" size="icon" onClick={() => setQty(p.id, qty + 1, p.stock)} disabled={qty >= p.stock}><Plus className="w-4 h-4" /></Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={checkout} onOpenChange={setCheckout}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>סיכום הזמנה</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {Object.entries(cart).map(([id, q]) => {
              const p: any = products.find((x: any) => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="flex items-center justify-between gap-2 border-b pb-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(Number(p.price))} × {q}</div>
                  </div>
                  <div className="font-semibold">{formatCurrency(Number(p.price) * q)}</div>
                  <Button variant="ghost" size="icon" onClick={() => setQty(id, 0, p.stock)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between font-bold text-lg"><span>סה"כ</span><span>{formatCurrency(total)}</span></div>
            <div className="text-xs text-muted-foreground">כל המחירים {VAT_LABEL}</div>
            {willExceed && (
              <div className="text-sm bg-warning/15 text-warning-foreground p-2 rounded flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> חורג מהמסגרת - דורש אישור מנהל
              </div>
            )}
          </div>
          <div className="space-y-3 pt-2">
            <Input placeholder="שם המזמין" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="טלפון לאיסוף" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
            <Textarea placeholder="הערות (אופציונלי)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCheckout(false)}>ביטול</Button>
            <Button onClick={submitOrder} disabled={placing || itemCount === 0}>
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : "אישור ושליחת הזמנה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
