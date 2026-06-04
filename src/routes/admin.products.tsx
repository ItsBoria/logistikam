import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listProductsAdmin, upsertProduct, deleteProduct, bulkImportProducts, uploadProductImage } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Upload, Download, ImageIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/admin/products")({
  ssr: false,
  head: () => ({ meta: [{ title: "מוצרים - פאנל ניהול" }] }),
  component: () => <AdminShell><Products /></AdminShell>,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1] || "");
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Products() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProductsAdmin);
  const upsertFn = useServerFn(upsertProduct);
  const deleteFn = useServerFn(deleteProduct);
  const bulkFn = useServerFn(bulkImportProducts);
  const uploadFn = useServerFn(uploadProductImage);
  const { data: products } = useQuery({ queryKey: ["admin-products"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);

  function newProduct() {
    setEditing({ name: "", description: "", price: 0, stock: 0, category: "", image_url: "", image_preview: "", active: true, low_stock_threshold: "" });
  }

  function startEdit(p: any) {
    // Use raw storage ref for save, signed url for preview
    setEditing({ ...p, image_url: p._raw_image_url || "", image_preview: p.image_url || "", low_stock_threshold: p.low_stock_threshold ?? "" });
  }

  async function save() {
    try {
      const thr = String(editing.low_stock_threshold ?? "").trim();
      await upsertFn({ data: {
        id: editing.id,
        name: editing.name,
        description: editing.description || null,
        price: Number(editing.price),
        stock: Number(editing.stock),
        category: editing.category || null,
        image_url: editing.image_url || "",
        active: !!editing.active,
        low_stock_threshold: thr === "" ? null : Number(thr),
      } });
      toast.success("נשמר");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("למחוק מוצר זה?")) return;
    try { await deleteFn({ data: { id } }); toast.success("נמחק"); qc.invalidateQueries({ queryKey: ["admin-products"] }); }
    catch (e: any) { toast.error(e.message); }
  }

  async function handleImageUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("הקובץ גדול מ-5MB"); return; }
    setUploading(true);
    try {
      const data_base64 = await fileToBase64(file);
      const res = await uploadFn({ data: {
        filename: file.name, content_type: file.type || "image/jpeg", data_base64,
      } });
      setEditing((e: any) => ({ ...e, image_url: res.storage_ref, image_preview: res.preview_url }));
      toast.success("התמונה הועלתה");
    } catch (e: any) {
      toast.error(e.message || "שגיאת העלאה");
    } finally {
      setUploading(false);
      if (imgFileRef.current) imgFileRef.current.value = "";
    }
  }

  function downloadTemplate() {
    const sample = [{ "שם": "דוגמה", "תיאור": "תיאור המוצר", "מחיר": 50, "מלאי": 10, "קטגוריה": "מאכלים", "תמונה": "https://..." }];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "מוצרים");
    XLSX.writeFile(wb, "products-template.xlsx");
  }

  async function importFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(ws);
      const rows = json.map(r => ({
        name: String(r["שם"] ?? r["name"] ?? "").trim(),
        description: r["תיאור"] ?? r["description"] ?? null,
        price: Number(r["מחיר"] ?? r["price"] ?? 0),
        stock: Number(r["מלאי"] ?? r["stock"] ?? 0),
        category: r["קטגוריה"] ?? r["category"] ?? null,
        image_url: r["תמונה"] ?? r["image_url"] ?? null,
      })).filter(r => r.name);
      if (!rows.length) { toast.error("הקובץ ריק או בפורמט שגוי"); return; }
      const res = await bulkFn({ data: { rows } });
      toast.success(`נוספו ${res.inserted} מוצרים`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.error(e.message || "שגיאה ביבוא"); }
    finally { if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">מוצרים</h1>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={importFile} className="hidden" />
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="w-4 h-4 ml-2" /> ייבוא Excel</Button>
          <Button variant="outline" onClick={downloadTemplate}><Download className="w-4 h-4 ml-2" /> תבנית</Button>
          <Button onClick={newProduct}><Plus className="w-4 h-4 ml-2" /> מוצר חדש</Button>
        </div>
      </div>

      {!products?.length ? <Card className="p-12 text-center text-muted-foreground">אין מוצרים</Card> :
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p: any) => (
            <Card key={p.id} className={`overflow-hidden ${!p.active ? "opacity-60" : ""}`}>
              <div className="aspect-square bg-muted">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>}
              </div>
              <div className="p-3 space-y-1">
                <div className="font-semibold leading-tight">{p.name}</div>
                <div className="flex justify-between text-sm">
                  <span className="font-bold">₪{Number(p.price).toFixed(0)}</span>
                  <span className="text-muted-foreground">מלאי: {p.stock}</span>
                </div>
                <div className="flex gap-1 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => startEdit(p)}><Pencil className="w-3 h-3" /></Button>
                  <Button variant="outline" size="sm" onClick={() => remove(p.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      }

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "עריכת מוצר" : "מוצר חדש"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><label className="text-sm">שם</label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="text-sm">תיאור</label><Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm">מחיר (₪)</label><Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} /></div>
                <div><label className="text-sm">מלאי</label><Input type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm">קטגוריה</label><Input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} /></div>
                <div>
                  <label className="text-sm">סף מלאי נמוך</label>
                  <Input type="number" min={0} placeholder="ברירת מחדל מהמערכת" value={editing.low_stock_threshold ?? ""} onChange={(e) => setEditing({ ...editing, low_stock_threshold: e.target.value })} />
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
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => imgFileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <ImageIcon className="w-4 h-4 ml-2" />}
                    העלאת קובץ
                  </Button>
                </div>
                <Input
                  placeholder="או הדבק קישור URL"
                  value={editing.image_url?.startsWith("storage:") ? "" : (editing.image_url ?? "")}
                  onChange={(e) => setEditing({ ...editing, image_url: e.target.value, image_preview: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="flex items-center gap-2"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })} /><label className="text-sm">פעיל</label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ביטול</Button>
            <Button onClick={save}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
