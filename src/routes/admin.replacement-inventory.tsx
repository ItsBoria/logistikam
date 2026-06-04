import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import {
  listReplacementProducts, upsertReplacementProduct, deleteReplacementProduct,
  adjustReplacementStock, bulkImportReplacementProducts,
} from "@/lib/replacement-admin.functions";
import { uploadProductImage } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Download, ImageIcon, Loader2, X, ArrowLeftRight, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/admin/replacement-inventory")({
  ssr: false,
  head: () => ({ meta: [{ title: "מלאי החלפות - פאנל ניהול" }] }),
  component: () => <AdminShell><Page /></AdminShell>,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReplacementProducts);
  const upsertFn = useServerFn(upsertReplacementProduct);
  const deleteFn = useServerFn(deleteReplacementProduct);
  const adjustFn = useServerFn(adjustReplacementStock);
  const bulkFn = useServerFn(bulkImportReplacementProducts);
  const uploadFn = useServerFn(uploadProductImage);

  const { data: products } = useQuery({ queryKey: ["admin-repl-products"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<any>(null);
  const [adjust, setAdjust] = useState<any>(null);
  const [moveQty, setMoveQty] = useState<string>("1");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);

  function newOne() {
    setEditing({ name: "", description: "", category: "", image_url: "", image_preview: "", active: true, takin_stock: 0, balai_stock: 0 });
  }
  function startEdit(p: any) {
    setEditing({ ...p, image_url: p._raw_image_url || "", image_preview: p.image_url || "" });
  }

  async function save() {
    try {
      await upsertFn({ data: {
        id: editing.id,
        name: editing.name,
        description: editing.description || null,
        category: editing.category || null,
        image_url: editing.image_url || "",
        active: !!editing.active,
        takin_stock: Number(editing.takin_stock) || 0,
        balai_stock: Number(editing.balai_stock) || 0,
      } });
      toast.success("נשמר");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-repl-products"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("למחוק פריט החלפה זה?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("נמחק");
      qc.invalidateQueries({ queryKey: ["admin-repl-products"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleImageUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("הקובץ גדול מ-5MB"); return; }
    setUploading(true);
    try {
      const data_base64 = await fileToBase64(file);
      const res = await uploadFn({ data: { filename: file.name, content_type: file.type || "image/jpeg", data_base64 } });
      setEditing((e: any) => ({ ...e, image_url: res.storage_ref, image_preview: res.preview_url }));
      toast.success("התמונה הועלתה");
    } catch (e: any) { toast.error(e.message || "שגיאת העלאה"); }
    finally { setUploading(false); if (imgFileRef.current) imgFileRef.current.value = ""; }
  }

  async function moveBalaiToTakin(p: any) {
    const n = Number(moveQty);
    if (!Number.isFinite(n) || n <= 0) { toast.error("כמות לא תקינה"); return; }
    try {
      await adjustFn({ data: { id: p.id, takin_delta: n, balai_delta: -n } });
      toast.success("הועבר לתקין");
      setAdjust(null);
      qc.invalidateQueries({ queryKey: ["admin-repl-products"] });
    } catch (e: any) { toast.error(e.message); }
  }

  async function writeOffBalai(p: any) {
    const n = Number(moveQty);
    if (!Number.isFinite(n) || n <= 0) { toast.error("כמות לא תקינה"); return; }
    try {
      await adjustFn({ data: { id: p.id, takin_delta: 0, balai_delta: -n } });
      toast.success("סומן כפסולת");
      setAdjust(null);
      qc.invalidateQueries({ queryKey: ["admin-repl-products"] });
    } catch (e: any) { toast.error(e.message); }
  }

  function downloadTemplate() {
    const sample = [{ "שם": "דוגמה", "תיאור": "תיאור", "קטגוריה": "חשמל", "תמונה": "https://...", "תקין": 5, "בלאי": 0 }];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "פריטי החלפה");
    XLSX.writeFile(wb, "replacements-template.xlsx");
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws);
      const rows = json.map((r) => ({
        name: String(r["שם"] ?? r["name"] ?? "").trim(),
        description: r["תיאור"] ?? r["description"] ?? null,
        category: r["קטגוריה"] ?? r["category"] ?? null,
        image_url: r["תמונה"] ?? r["image_url"] ?? null,
        takin_stock: Number(r["תקין"] ?? r["takin_stock"] ?? 0),
        balai_stock: Number(r["בלאי"] ?? r["balai_stock"] ?? 0),
      })).filter((r) => r.name);
      if (!rows.length) { toast.error("הקובץ ריק או בפורמט שגוי"); return; }
      const res = await bulkFn({ data: { rows } });
      toast.success(`נוספו ${res.inserted} פריטים`);
      qc.invalidateQueries({ queryKey: ["admin-repl-products"] });
    } catch (e: any) { toast.error(e.message || "שגיאה ביבוא"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">מלאי החלפות</h1>
          <p className="text-xs text-muted-foreground">פריטי חלופה לציוד שבור. תקין = ניתן לתת לצוות. בלאי = מאוחסן אצלך, לא נראה לצוותים.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} className="hidden" />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 ml-2" /> ייבוא Excel</Button>
          <Button variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 ml-2" /> תבנית</Button>
          <Button onClick={newOne}><Plus className="w-4 h-4 ml-2" /> פריט חדש</Button>
        </div>
      </div>

      {!products?.length ? (
        <Card className="p-12 text-center text-muted-foreground">אין פריטי החלפה</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map((p: any) => (
            <Card key={p.id} className={`overflow-hidden ${!p.active ? "opacity-60" : ""}`}>
              <div className="flex">
                <div className="w-28 h-28 bg-muted shrink-0">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">🔧</div>}
                </div>
                <div className="p-3 flex-1 space-y-2">
                  <div className="font-semibold leading-tight">{p.name}</div>
                  {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                  <div className="flex gap-3 text-sm">
                    <span className="px-2 py-0.5 rounded bg-success/15 text-success">תקין: <b>{p.takin_stock}</b></span>
                    <span className="px-2 py-0.5 rounded bg-warning/15 text-warning-foreground">בלאי: <b>{p.balai_stock}</b></span>
                  </div>
                  <div className="flex gap-1 pt-1 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => startEdit(p)}><Pencil className="w-3 h-3 ml-1" /> עריכה</Button>
                    <Button variant="outline" size="sm" onClick={() => { setAdjust(p); setMoveQty("1"); }}><ArrowLeftRight className="w-3 h-3 ml-1" /> ניהול מלאי</Button>
                    <Button variant="outline" size="sm" onClick={() => remove(p.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "עריכת פריט החלפה" : "פריט החלפה חדש"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><label className="text-sm">שם</label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="text-sm">תיאור</label><Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><label className="text-sm">קטגוריה</label><Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm">תקין (זמין לצוותים)</label>
                  <Input type="number" min={0} value={editing.takin_stock} onChange={(e) => setEditing({ ...editing, takin_stock: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm">בלאי (אדמין בלבד)</label>
                  <Input type="number" min={0} value={editing.balai_stock} onChange={(e) => setEditing({ ...editing, balai_stock: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm">תמונה</label>
                {editing.image_preview && (
                  <div className="relative w-32 h-32 rounded overflow-hidden border">
                    <img src={editing.image_preview} className="w-full h-full object-cover" alt="" />
                    <Button type="button" variant="destructive" size="icon" className="absolute top-1 left-1 h-6 w-6"
                      onClick={() => setEditing({ ...editing, image_url: "", image_preview: "" })}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                <input ref={imgFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                <Button type="button" variant="outline" size="sm" onClick={() => imgFileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <ImageIcon className="w-4 h-4 ml-2" />}
                  העלאת קובץ
                </Button>
                <Input
                  placeholder="או הדבק קישור URL"
                  value={editing.image_url?.startsWith("storage:") ? "" : (editing.image_url ?? "")}
                  onChange={(e) => setEditing({ ...editing, image_url: e.target.value, image_preview: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
                <label className="text-sm">פעיל</label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            <Button onClick={save}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock-move dialog */}
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>ניהול מלאי — {adjust?.name}</DialogTitle></DialogHeader>
          {adjust && (
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <span className="px-2 py-0.5 rounded bg-success/15 text-success">תקין: <b>{adjust.takin_stock}</b></span>
                <span className="px-2 py-0.5 rounded bg-warning/15 text-warning-foreground">בלאי: <b>{adjust.balai_stock}</b></span>
              </div>
              <div>
                <label className="text-sm">כמות</label>
                <Input type="number" min={1} value={moveQty} onChange={(e) => setMoveQty(e.target.value)} dir="ltr" />
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => moveBalaiToTakin(adjust)}>
                  <ArrowLeftRight className="w-4 h-4 ml-2" /> העבר מבלאי לתקין (לאחר תיקון)
                </Button>
                <Button variant="outline" onClick={() => writeOffBalai(adjust)}>
                  <MinusCircle className="w-4 h-4 ml-2" /> סמן כפסולת (הסר מבלאי)
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
