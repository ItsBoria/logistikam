import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getShopData, placeOrder } from "@/lib/team.functions";
import { getTeamSession, setTeamSession } from "@/lib/team-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Minus, LogOut, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shop")({
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

  useEffect(() => { if (session?.contact_phone) setPhone(session.contact_phone); }, [session?.contact_phone]);

  const products = data?.products ?? [];
  const total = useMemo(() => products.reduce((s, p: any) => s + Number(p.price) * (cart[p.id] || 0), 0), [products, cart]);
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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-lg">{data?.team.name}</h1>
            <p className="text-xs text-muted-foreground">
              {limit > 0 ? <>נוצל: ₪{spent.toFixed(0)} / ₪{limit.toFixed(0)} · נותר ₪{Math.max(0, remaining).toFixed(0)}</> : "ללא מגבלת חודש"}
            </p>
          </div>
          <div className="flex items-center gap-2">
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

      <main className="max-w-6xl mx-auto p-4">
        {products.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">אין מוצרים זמינים כעת</Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p: any) => {
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
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold text-lg">₪{Number(p.price).toFixed(0)}</span>
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
                    <div className="text-xs text-muted-foreground">₪{Number(p.price).toFixed(0)} × {q}</div>
                  </div>
                  <div className="font-semibold">₪{(Number(p.price) * q).toFixed(0)}</div>
                  <Button variant="ghost" size="icon" onClick={() => setQty(id, 0, p.stock)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between font-bold text-lg"><span>סה"כ</span><span>₪{total.toFixed(0)}</span></div>
            {willExceed && (
              <div className="text-sm bg-warning/15 text-warning-foreground p-2 rounded flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> חורג מהמסגרת - דורש אישור מנהל
              </div>
            )}
          </div>
          <div className="space-y-3 pt-2">
            <Input placeholder="שם המזמין" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="טלפון לאיסוף (יישלח SMS)" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" />
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
