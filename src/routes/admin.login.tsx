import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminAuthStatus, resolveAdminEmail, bootstrapAdminUsername } from "@/lib/admin-auth.functions";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "כניסת מנהלים" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const { session } = useSupabaseSession();
  useEffect(() => {
    if (session) navigate({ to: "/admin", replace: true });
  }, [session, navigate]);

  const statusFn = useServerFn(adminAuthStatus);
  const resolveFn = useServerFn(resolveAdminEmail);
  const bootstrapFn = useServerFn(bootstrapAdminUsername);
  const { data: status } = useQuery({ queryKey: ["admin-auth-status"], queryFn: () => statusFn() });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { email } = await resolveFn({ data: { identifier: username } });
      if (!email) throw new Error("שם משתמש או סיסמה שגויים");
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("שם משתמש או סיסמה שגויים");
      toast.success("ברוך/ה הבא/ה");
      navigate({ to: "/admin", replace: true });
    } catch (e: any) {
      toast.error(e.message || "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  async function onBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { email } = await bootstrapFn({ data: { username, password } });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("מנהל ראשי נוצר");
    } catch (e: any) {
      toast.error(e.message || "שגיאה");
    } finally {
      setLoading(false);
    }
  }

  const needsBootstrap = status?.needsBootstrap;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/30 to-accent/40">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">כניסת מנהלים</h1>
          <p className="text-muted-foreground mt-2">{needsBootstrap ? "אתחול מנהל ראשי" : "התחבר/י לפאנל ניהול"}</p>
        </div>
        <Card className="p-8 shadow-xl">
          <form onSubmit={needsBootstrap ? onBootstrap : onSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {needsBootstrap ? "שם משתמש" : "שם משתמש או אימייל"}
              </label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                dir="ltr"
                autoComplete="username"
                required
                placeholder={needsBootstrap ? "admin" : "admin או name@example.com"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">סיסמה</label>
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                dir="ltr"
                autoComplete={needsBootstrap ? "new-password" : "current-password"}
                required
                minLength={8}
              />
              {needsBootstrap && <p className="text-xs text-muted-foreground mt-1">בחר/י סיסמה חזקה (לפחות 8 תווים)</p>}
            </div>
            <Button type="submit" disabled={loading} className="w-full h-11">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : needsBootstrap ? "צור מנהל וכנס" : "כניסה"}
            </Button>
          </form>
        </Card>
        <div className="text-center mt-6">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="w-4 h-4" /> חזרה לכניסת צוותים
          </Link>
        </div>
      </div>
    </div>
  );
}
