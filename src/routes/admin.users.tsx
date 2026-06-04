import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { listAdminUsers, createAdminUser, deleteAdminUser } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export const Route = createFileRoute("/admin/users")({
  ssr: false,
  head: () => ({ meta: [{ title: "מנהלים - פאנל ניהול" }] }),
  component: () => <AdminShell><Admins /></AdminShell>,
});

function Admins() {
  const qc = useQueryClient();
  const { session } = useSupabaseSession();
  const listFn = useServerFn(listAdminUsers);
  const createFn = useServerFn(createAdminUser);
  const deleteFn = useServerFn(deleteAdminUser);
  const { data: admins } = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function create() {
    try {
      await createFn({ data: { email, username, password } });
      toast.success("נוסף מנהל");
      setEmail(""); setUsername(""); setPassword(""); setCreating(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("להסיר מנהל זה?")) return;
    try { await deleteFn({ data: { user_id: id } }); toast.success("נמחק"); qc.invalidateQueries({ queryKey: ["admin-users"] }); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">מנהלים</h1>
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 ml-2" /> מנהל חדש</Button>
      </div>

      <Card className="divide-y">
        {admins?.map((a: any) => (
          <div key={a.user_id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><UserCog className="w-5 h-5" /></div>
              <div>
                <div className="font-medium">{a.username ? `@${a.username}` : a.email}</div>
                <div className="text-xs text-muted-foreground">
                  {a.username ? `${a.email} · ` : ""}נוסף: {new Date(a.created_at).toLocaleDateString("he-IL")}
                </div>
              </div>
            </div>
            {a.user_id !== session?.user.id ? (
              <Button variant="ghost" size="icon" onClick={() => remove(a.user_id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            ) : <span className="text-xs text-muted-foreground">(אתה)</span>}
          </div>
        ))}
        {!admins?.length && <div className="p-12 text-center text-muted-foreground">אין מנהלים</div>}
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוספת מנהל</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm">אימייל</label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="name@example.com" /></div>
            <div>
              <label className="text-sm">שם משתמש</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} type="text" dir="ltr" placeholder="admin" />
              <p className="text-xs text-muted-foreground mt-1">אותיות באנגלית, מספרים, נקודה, קו תחתון, מקף (2-40 תווים)</p>
            </div>
            <div><label className="text-sm">סיסמה (לפחות 8 תווים)</label><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" dir="ltr" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>ביטול</Button>
            <Button onClick={create} disabled={!email || !/^[a-zA-Z0-9_.-]{2,40}$/.test(username) || password.length < 8}>הוסף</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
