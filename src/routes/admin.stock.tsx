import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listProductsAdmin, updateProductStock } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Save, AlertTriangle } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/stock")({
  ssr: false,
  head: () => ({ meta: [{ title: "מלאי - פאנל" }] }),
  component: () => <AdminShell><Stock /></AdminShell>,
});

function Stock() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductsAdmin);
  const updateFn = useServerFn(updateProductStock);
  const { data: products, isLoading } = useQuery({ queryKey: ["admin-products"], queryFn: () => listFn() });
  const [draft, setDraft] = useState<Record<string, { stock: string; threshold: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  function setField(id: string, field: "stock" | "threshold", value: string, original: { stock: number; threshold: any }) {
    setDraft((d) => ({
      ...d,
      [id]: {
        stock: field === "stock" ? value : (d[id]?.stock ?? String(original.stock)),
        threshold: field === "threshold" ? value : (d[id]?.threshold ?? (original.threshold ?? "")),
      },
    }));
  }

  async function save(p: any) {
    const d = draft[p.id];
    if (!d) return;
    const stock = Number(d.stock);
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) { toast.error("ערך מלאי לא תקין"); return; }
    const thrStr = String(d.threshold ?? "").trim();
    const threshold = thrStr === "" ? null : Number(thrStr);
    if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0 || !Number.isInteger(threshold))) {
      toast.error("ערך סף לא תקין");
      return;
    }
    setSavingId(p.id);
    try {
      await updateFn({ data: { id: p.id, stock, low_stock_threshold: threshold } });
      toast.success("נשמר");
      setDraft((dd) => { const n = { ...dd }; delete n[p.id]; return n; });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingId(null);
    }
  }

  const filtered = useMemo(() => {
    const all = products ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((p: any) =>
      (p.name || "").toLowerCase().includes(term) ||
      (p.category || "").toLowerCase().includes(term),
    );
  }, [products, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">מלאי</h1>
          <p className="text-sm text-muted-foreground">עדכון כמות במלאי וסף התראה.</p>
        </div>
        <SearchInput
          containerClassName="w-full sm:w-72 max-w-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onClear={() => setQ("")}
          placeholder="חיפוש מוצר/קטגוריה"
        />
      </div>

      {isLoading ? (
        <Card className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></Card>
      ) : !filtered.length ? (
        <Card className="p-12 text-center text-muted-foreground">אין מוצרים</Card>
      ) : (
        <Card className="divide-y">
          {filtered.map((p: any) => {
            const effThreshold = p.low_stock_threshold ?? null;
            const stockDraft = draft[p.id]?.stock ?? String(p.stock);
            const thrDraft = draft[p.id]?.threshold ?? (effThreshold ?? "");
            const dirty = !!draft[p.id];
            const low = p.stock <= (effThreshold ?? 5);
            return (
              <div key={p.id} className="p-3 flex items-center gap-3 flex-wrap">
                <div className="w-12 h-12 rounded bg-muted overflow-hidden flex-shrink-0">
                  {p.image_url ? <img src={p.image_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xl">📦</div>}
                </div>
                <div className="flex-1 min-w-[150px]">
                  <div className="font-medium flex items-center gap-2">
                    {p.name}
                    {low && <AlertTriangle className="w-4 h-4 text-warning" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.category || "—"}</div>
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">מלאי</label>
                  <Input
                    type="number" min={0} className="h-9 w-20 text-center" dir="ltr"
                    value={stockDraft}
                    onChange={(e) => setField(p.id, "stock", e.target.value, { stock: p.stock, threshold: effThreshold })}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground">סף</label>
                  <Input
                    type="number" min={0} className="h-9 w-20 text-center" dir="ltr" placeholder="ברירת מחדל"
                    value={thrDraft}
                    onChange={(e) => setField(p.id, "threshold", e.target.value, { stock: p.stock, threshold: effThreshold })}
                  />
                </div>
                <Button size="sm" onClick={() => save(p)} disabled={!dirty || savingId === p.id}>
                  {savingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-1" /> שמור</>}
                </Button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
