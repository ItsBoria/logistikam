import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  updateAdminUserRole,
  searchRegisteredUsers,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShieldCheck, Package, Search, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useSupabaseSession } from "@/hooks/use-supabase-session";

export const Route = createFileRoute("/admin/users")({
  ssr: false,
  head: () => ({ meta: [{ title: "מנהלים - פאנל ניהול" }] }),
  component: () => <AdminShell adminOnly><Admins /></AdminShell>,
});

function Admins() {
  const qc = useQueryClient();
  const { session } = useSupabaseSession();
  const listFn = useServerFn(listAdminUsers);
  const createFn = useServerFn(createAdminUser);
  const deleteFn = useServerFn(deleteAdminUser);
  const roleFn = useServerFn(updateAdminUserRole);
  const searchFn = useServerFn(searchRegisteredUsers);

  const { data: admins } = useQuery({ queryKey: ["admin-users"], queryFn: () => listFn() });
  const [query, setQuery] = useState("");
  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ["registered-users", query],
    queryFn: () => searchFn({ data: { query } }),
  });

  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("admin");


  async function create() {
    try {
      await createFn({ data: { email, username, password, role } });
      toast.success("המשתמש נוסף");
      setEmail(""); setUsername(""); setPassword(""); setRole("admin"); setCreating(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["registered-users"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function remove(id: string) {
    if (!confirm("להסיר משתמש זה?")) return;
    try {
      await deleteFn({ data: { user_id: id } });
      toast.success("נמחק");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["registered-users"] });
    } catch (e: any) { toast.error(e.message); }
  }
  async function changeRole(id: string, newRole: "admin" | "staff" | "customer") {
    try {
      await roleFn({ data: { user_id: id, role: newRole } });
      toast.success("התפקיד עודכן");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["registered-users"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">משתמשים</h1>
          <p className="text-sm text-muted-foreground">ניהול תפקידים והרשאות</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="w-4 h-4 ml-2" /> משתמש חדש</Button>
      </div>

      <Tabs defaultValue="system" className="w-full">
        <TabsList>
          <TabsTrigger value="system">משתמשי מערכת</TabsTrigger>
          <TabsTrigger value="all">כל המשתמשים</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="mt-4">
          <Card className="divide-y">
            {admins?.map((a: any) => {
              const isMe = a.user_id === session?.user.id;
              const isAdmin = a.is_admin;
              return (
                <div key={a.user_id} className="flex items-center justify-between p-4 gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>
                      {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {a.username ? `@${a.username}` : a.email}
                        <span className={`text-xs px-2 py-0.5 rounded ${isAdmin ? "bg-primary/15 text-primary" : "bg-muted text-foreground"}`}>
                          {isAdmin ? "מנהל" : "צוות מחסן"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.username ? `${a.email} · ` : ""}נוסף: {new Date(a.created_at).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isMe && (
                      <Select value={isAdmin ? "admin" : "staff"} onValueChange={(v) => changeRole(a.user_id, v as any)}>
                        <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">מנהל</SelectItem>
                          <SelectItem value="staff">צוות מחסן</SelectItem>
                          <SelectItem value="customer">לקוח (הסר)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {!isMe ? (
                      <Button variant="ghost" size="icon" onClick={() => remove(a.user_id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    ) : <span className="text-xs text-muted-foreground">(אתה)</span>}
                  </div>
                </div>
              );
            })}
            {!admins?.length && <div className="p-12 text-center text-muted-foreground">אין משתמשים</div>}
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי אימייל או שם..."
              className="pr-9"
            />
          </div>
          <Card className="divide-y">
            {searching && !searchResults?.length && (
              <div className="p-8 text-center text-muted-foreground text-sm">טוען...</div>
            )}
            {searchResults?.map((u: any) => {
              const isMe = u.id === session?.user.id;
              const initials = (u.displayName || u.email || "?").trim().charAt(0).toUpperCase();
              const roleLabel = u.currentRole === "admin" ? "מנהל" : u.currentRole === "staff" ? "צוות" : "לקוח";
              const roleClass = u.currentRole === "admin"
                ? "bg-primary/15 text-primary"
                : u.currentRole === "staff"
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-foreground";
              return (
                <div key={u.id} className="flex items-center justify-between p-4 gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-medium">
                      {initials || <UserIcon className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span className="truncate">{u.displayName || u.email}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${roleClass}`}>{roleLabel}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                          {u.provider === "google" ? "Google" : u.provider === "email" ? "אימייל" : u.provider}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate" dir="ltr">{u.email}</div>
                    </div>
                  </div>
                  {!isMe ? (
                    <Select value={u.currentRole} onValueChange={(v) => changeRole(u.id, v as any)}>
                      <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">מנהל</SelectItem>
                        <SelectItem value="staff">צוות מחסן</SelectItem>
                        <SelectItem value="customer">לקוח</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : <span className="text-xs text-muted-foreground">(אתה)</span>}
                </div>
              );
            })}
            {!searching && !searchResults?.length && (
              <div className="p-12 text-center text-muted-foreground text-sm">אין משתמשים תואמים</div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>הוספת משתמש</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm">תפקיד</label>
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">מנהל (גישה מלאה)</SelectItem>
                  <SelectItem value="staff">צוות מחסן (מלאי + סטטוס הזמנות בלבד)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-sm">אימייל</label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" placeholder="name@example.com" /></div>
            <div>
              <label className="text-sm">שם משתמש</label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} type="text" dir="ltr" placeholder="user" />
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
