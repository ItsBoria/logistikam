import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { getAdminDashboard, setTeamMonthlyLimit } from "@/lib/admin-dashboard.functions";
import { updateOrderStatus } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/pricing";
import { Loader2, ShoppingBag, Clock, DollarSign, Users, AlertTriangle, Pencil, Check, X, Package } from "lucide-react";
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
  const dashFn = useServerFn(getAdminDashboard);
  const limitFn = useServerFn(setTeamMonthlyLimit);
  const statusFn = useServerFn(updateOrderStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => dashFn(),
    staleTime: 30_000,
  });

  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [limitValue, setLimitValue] = useState<string>("");

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const { kpis, topTeams, recentOrders, lowStock } = data;

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

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Clock className="w-5 h-5" />} label="ממתינות" value={kpis.pending + kpis.awaiting} tone="warning" />
        <Kpi icon={<ShoppingBag className="w-5 h-5" />} label="הזמנות החודש" value={kpis.monthOrders} />
        <Kpi icon={<DollarSign className="w-5 h-5" />} label="הכנסות החודש" value={formatCurrency(kpis.monthRevenue)} />
        <Kpi icon={<Users className="w-5 h-5" />} label="צוותים פעילים" value={kpis.activeTeams} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top teams */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">תקציבי צוותים</h2>
            <Link to="/admin/teams" className="text-xs text-muted-foreground hover:text-foreground">ניהול צוותים ←</Link>
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
                        {!isEditing && (
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
            <Link to="/admin/products" className="text-xs text-muted-foreground hover:text-foreground">ניהול מוצרים ←</Link>
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
