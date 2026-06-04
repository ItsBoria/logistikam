import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getShopData, placeOrder } from "@/lib/team.functions";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push.functions";
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
import { ShoppingCart, Plus, Minus, LogOut, AlertTriangle, Loader2, Trash2, Search, Bell, BellOff, ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/")({
  ssr: false,
  head: () => ({ meta: [{ title: "חנות - מערכת הזמנות צוותים" }] }),
  component: Shop,
});

type CartMap = Record<string, number>;

function urlBase64ToUint8Array(base64String: string) {
  const clean = (base64String || "").trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9_\-=+/]/g, "");
  const padding = "=".repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

function Shop() {
  const navigate = useNavigate();
  const session = typeof window !== "undefined" ? getTeamSession() : null;
  useEffect(() => { if (!session) navigate({ to: "/", replace: true }); }, [session, navigate]);

  const fetchShop = useServerFn(getShopData);
  const orderFn = useServerFn(placeOrder);
  const vapidFn = useServerFn(getVapidPublicKey);
  const subscribeFn = useServerFn(subscribePush);
  const unsubscribeFn = useServerFn(unsubscribePush);

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

  // search/filter
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);

  // push
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone === true);
  const iosNeedsInstall = isIOS && !isStandalone && !pushSupported;

  useEffect(() => { if (session?.contact_phone) setPhone(session.contact_phone); }, [session?.contact_phone]);

  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setPushOn(!!sub);
    });
  }, [pushSupported]);

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

  async function enablePush() {
    if (!pushSupported) { toast.error("הדפדפן לא תומך בהתראות Push"); return; }
    setPushBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error("ההרשאה נדחתה"); return; }
      const { key } = await vapidFn();
      if (!key) { toast.error("התראות אינן מוגדרות במערכת"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });
      }
      const json: any = sub.toJSON();
      await subscribeFn({ data: {
        pin: session!.pin,
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      } });
      setPushOn(true);
      toast.success("התראות הופעלו");
    } catch (e: any) {
      toast.error(e.message || "שגיאה בהפעלת התראות");
    } finally { setPushBusy(false); }
  }

  async function disablePush() {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setPushOn(false);
      toast.success("התראות כובו");
    } catch (e: any) {
      toast.error(e.message || "שגיאה");
    } finally { setPushBusy(false); }
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
            {pushSupported ? (
              pushOn
                ? <Button variant="outline" size="sm" onClick={disablePush} disabled={pushBusy}><BellOff className="w-4 h-4 ml-2" /> כבה התראות</Button>
                : <Button variant="outline" size="sm" onClick={enablePush} disabled={pushBusy}><Bell className="w-4 h-4 ml-2" /> הפעל התראות</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => toast.info(iosNeedsInstall ? "ב‑iPhone יש להוסיף את האתר למסך הבית (שתף → הוסף למסך הבית) ולפתוח משם, ואז להפעיל התראות" : "הדפדפן שלך לא תומך בהתראות Push")}>
                <Bell className="w-4 h-4 ml-2" /> הפעל התראות
              </Button>
            )}
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
