import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { getAdminDashboard, setTeamMonthlyLimit } from "@/lib/admin-dashboard.functions";
import { updateOrderStatus, getAppSettings, setDefaultLowStockThreshold } from "@/lib/admin.functions";
import { useAdminRoles } from "@/hooks/use-admin-roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/pricing";
import { Loader2, ShoppingBag, Clock, DollarSign, Users, AlertTriangle, Pencil, Check, X, Package, Replace, Settings, Timer, TrendingDown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({ meta: [{ title: "סקירה - פאנל ניהול" }] }),
  component: () => <AdminShell><DashboardPage /></AdminShell>,
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

function DashboardPage() {
  const qc = useQueryClient();
  const { data: myRoles } = useAdminRoles();
  const isAdmin = !!myRoles?.isAdmin;
  const dashFn = useServerFn(getAdminDashboard);
  const limitFn = useServerFn(setTeamMonthlyLimit);
  const statusFn = useServerFn(updateOrderStatus);
  const settingsFn = useServerFn(getAppSettings);
  const setThresholdFn = useServerFn(setDefaultLowStockThreshold);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => dashFn(),
    staleTime: 30_000,
  });
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => settingsFn(),
    staleTime: 60_000,
  });

  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState<string>("");
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdValue, setThresholdValue] = useState<string>("");

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const { kpis, topTeams, recentOrders, lowStock, stuckOrders } = data;

  async function changeStatus(id: string, status: string) {
    try {
      await statusFn({ data: { id, status: status as any } });
      toast.success("סטטוס עודכן");
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) { toast.error(e.message || "שגיאה"); }
  }

  async function saveLimit(teamId: string) {
    const n = Number(limitValue);
    if (!Number.isFinite(n) || n < 0) { toast.error("ערך לא תקין"); return; }
    try {
      await limitFn({ data: { team_id: teamId, monthly_limit: n } });
      toast.success("המסגרת עודכנה");
      setEditingTeam(null);
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) { toast.error(e.message || "שגיאה"); }
  }

  async function saveThreshold() {
    const n = Number(thresholdValue);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) { toast.error("ערך לא תקין"); return; }
    try {
      await setThresholdFn({ data: { value: n } });
      toast.success("סף ברירת המחדל עודכן");
      setEditingThreshold(false);
      qc.invalidateQueries({ queryKey: ["app-settings"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (e: any) { toast.error(e.message || "שגיאה"); }
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Clock className="w-5 h-5" />} label="ממתינות" value={kpis.pending + kpis.awaiting} tone="warning" />
        <Kpi icon={<Timer className="w-5 h-5" />} label="הזמנות תקועות" value={kpis.stuck ?? 0} tone={(kpis.stuck ?? 0) > 0 ? "warning" : undefined} />
        <Kpi icon={<Replace className="w-5 h-5" />} label="בקשות החלפה" value={kpis.pendingReplacements} tone={kpis.pendingReplacements > 0 ? "warning" : undefined} />
        <Kpi icon={<Package className="w-5 h-5" />} label="מלאי נמוך" value={kpis.lowStock} tone={kpis.lowStock > 0 ? "warning" : undefined} />
        <Kpi icon={<TrendingDown className="w-5 h-5" />} label="צוותים מעל תקציב" value={kpis.overBudget ?? 0} tone={(kpis.overBudget ?? 0) > 0 ? "warning" : undefined} />
        <Kpi icon={<ShoppingBag className="w-5 h-5" />} label="הזמנות החודש" value={kpis.monthOrders} />
        {isAdmin && (
          <Kpi icon={<DollarSign className="w-5 h-5" />} label="הכנסות החודש" value={formatCurrency(kpis.monthRevenue)} />
        )}
        <Kpi icon={<Users className="w-5 h-5" />} label="צוותים פעילים" value={kpis.activeTeams} />
      </div>

      {/* Stuck orders */}
      {stuckOrders && stuckOrders.length > 0 && (
        <Card className="p-4 border-warning/40">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2 text-warning-foreground"><Timer className="w-4 h-4" /> הזמנות שדורשות תשומת לב</h2>
            <Link to="/admin/orders" className="text-xs text-muted-foreground hover:text-foreground">לכל ההזמנות ←</Link>
          </div>
          <p className="text-xs text-muted-foreground mb-3">ממתינות לאישור מעל 24 שעות, או מוכנות לאיסוף מעל 48 שעות.</p>
          <div className="space-y-2">
            {stuckOrders.map((o: any) => {
              const ageH = Math.round((Date.now() - new Date(o.created_at).getTime()) / 3600000);
              return (
                <div key={o.id} className="flex items-center justify-between gap-3 border-b last:border-b-0 pb-2 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[o.status] ?? STATUS_COLOR.pending}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
                      <span className="font-medium text-sm truncate">{o.teams?.name}</span>
                      <span className="text-xs text-warning-foreground">לפני {ageH} שעות</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{o.ordered_by_name}</div>
                  </div>
                  <div className="font-bold tabular-nums text-sm">{formatCurrency(Number(o.total))}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}


      {/* Global low-stock threshold (admin only) */}
      {isAdmin && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold flex items-center gap-2"><Settings className="w-4 h-4" /> סף ברירת מחדל למלאי נמוך</h2>
              <p className="text-xs text-muted-foreground mt-1">מוצרים בלי סף אישי ייחשבו "מלאי נמוך" כאשר המלאי קטן או שווה לערך הזה.</p>
            </div>
            {editingThreshold ? (
              <div className="flex items-center gap-2">
                <Input type="number" min={0} value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} className="h-9 w-24" dir="ltr" />
                <Button size="icon" variant="default" className="h-9 w-9" onClick={saveThreshold}><Check className="w-4 h-4" /></Button>
                <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setEditingThreshold(false)}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tabular-nums">{settings?.default_low_stock_threshold ?? data.defaultLowStockThreshold ?? 5}</span>
                <Button variant="outline" size="sm" onClick={() => { setEditingThreshold(true); setThresholdValue(String(settings?.default_low_stock_threshold ?? data.defaultLowStockThreshold ?? 5)); }}>
                  <Pencil className="w-3 h-3 ml-1" /> שינוי
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top teams */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">תקציבי צוותים</h2>
            {isAdmin && <Link to="/admin/teams" className="text-xs text-muted-foreground hover:text-foreground">ניהול צוותים ←</Link>}
          </div>
          {topTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין צוותים פעילים</p>
          ) : (
            <div className="space-y-3">
              {topTeams.map((t: any) => {
                const isEditing = editingTeam === t.id;
                const overBudget = t.monthly_limit > 0 && t.pct >= 100;
                const nearBudget = t.monthly_limit > 0 && t.pct >= 80 && t.pct < 100;
                const barClass = overBudget ? "bg-destructive" : nearBudget ? "bg-warning" : "bg-primary";
                return (
                  <div key={t.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{t.name}</span>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(t.spent)}{t.monthly_limit > 0 ? ` / ${formatCurrency(t.monthly_limit)}` : ""}
                        </span>
                        {!isEditing && isAdmin && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTeam(t.id); setLimitValue(String(t.monthly_limit)); }}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" min={0} value={limitValue} onChange={(e) => setLimitValue(e.target.value)} className="h-8" dir="ltr" />
                        <Button size="icon" variant="default" className="h-8 w-8" onClick={() => saveLimit(t.id)}><Check className="w-4 h-4" /></Button>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditingTeam(null)}><X className="w-4 h-4" /></Button>
                      </div>
                    ) : t.monthly_limit > 0 ? (
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${barClass} transition-all`} style={{ width: `${Math.min(100, t.pct)}%` }} />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">ללא מגבלה</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Low stock */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><Package className="w-4 h-4" /> מלאי נמוך</h2>
            <Link to={isAdmin ? "/admin/products" : "/admin/stock"} className="text-xs text-muted-foreground hover:text-foreground">{isAdmin ? "ניהול מוצרים" : "ניהול מלאי"} ←</Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">כל המוצרים במלאי תקין</p>
          ) : (
            <div className="space-y-2">
              {lowStock.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-b-0 pb-2 last:pb-0">
                  <span className="font-medium">{p.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${p.stock === 0 ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning-foreground"}`}>
                    {p.stock === 0 ? "אזל" : `${p.stock} ביחידות`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">הזמנות אחרונות</h2>
          <Link to="/admin/orders" className="text-xs text-muted-foreground hover:text-foreground">לכל ההזמנות ←</Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין הזמנות עדיין</p>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between gap-3 border-b last:border-b-0 pb-2 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[o.status] ?? STATUS_COLOR.pending}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                    <span className="font-medium text-sm truncate">{o.teams?.name}</span>
                    <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("he-IL")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{o.ordered_by_name}</div>
                </div>
                <div className="font-bold tabular-nums">{formatCurrency(Number(o.total))}</div>
                <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "warning" }) {
  return (
    <Card className="p-4">
      <div className={`flex items-center gap-2 text-xs ${tone === "warning" ? "text-warning-foreground" : "text-muted-foreground"}`}>
        {tone === "warning" ? <AlertTriangle className="w-4 h-4" /> : icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}
