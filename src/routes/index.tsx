import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { verifyTeamPin } from "@/lib/team.functions";
import { setTeamSession, getTeamSession } from "@/lib/team-session";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, ShoppingBag, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [{ title: "כניסה - מערכת הזמנות צוותים" }] }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { session } = useSupabaseSession();
  const verify = useServerFn(verifyTeamPin);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  // If admin is signed in, lock them to the admin area
  useEffect(() => {
    if (session) navigate({ to: "/admin/orders", replace: true });
  }, [session, navigate]);

  // If already PIN-authed, jump to shop
  useEffect(() => {
    if (getTeamSession()) navigate({ to: "/shop", replace: true });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const team = await verify({ data: { pin } });
      setTeamSession({
        team_id: team.id, team_name: team.name, pin,
        monthly_limit: Number(team.monthly_limit),
        contact_phone: team.contact_phone,
      });
      toast.success(`ברוכים הבאים, ${team.name}`);
      navigate({ to: "/shop" });
    } catch (err: any) {
      toast.error(err.message || "שגיאה");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/30 to-accent/40">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">מערכת הזמנות צוותים</h1>
          <p className="text-muted-foreground mt-2">היכנס/י עם קוד הצוות שלך</p>
        </div>

        <Card className="p-8 shadow-xl">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">קוד צוות (PIN)</label>
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="הכנס/י קוד"
                className="text-center text-lg tracking-widest h-12"
                autoFocus
                required
              />
            </div>
            <Button type="submit" disabled={loading || !pin} className="w-full h-12 text-base">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "כניסה"}
            </Button>
          </form>
        </Card>

        <div className="text-center mt-6">
          <Link to="/admin/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ShieldCheck className="w-4 h-4" /> כניסת מנהלים
          </Link>
        </div>
      </div>
    </div>
  );
}
