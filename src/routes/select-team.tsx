import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { listActiveTeams, setMyTeam, getMyTeamContext } from "@/lib/membership.functions";
import { setTeamSession, setAdminActing } from "@/lib/team-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/select-team")({
  ssr: false,
  head: () => ({ meta: [{ title: "בחירת צוות" }] }),
  component: SelectTeam,
});

function SelectTeam() {
  const navigate = useNavigate();
  const { session, loading } = useSupabaseSession();
  const listFn = useServerFn(listActiveTeams);
  const setFn = useServerFn(setMyTeam);
  const ctxFn = useServerFn(getMyTeamContext);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/", replace: true });
  }, [loading, session, navigate]);

  const { data: teams, isLoading } = useQuery({
    enabled: !!session,
    queryKey: ["active-teams"],
    queryFn: () => listFn(),
  });

  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  async function onContinue() {
    if (!teamId) return;
    setSaving(true);
    try {
      await setFn({ data: { team_id: teamId } });
      const ctx = await ctxFn();
      if (ctx) {
        setTeamSession(ctx);
        setAdminActing(false);
        navigate({ to: "/shop", replace: true });
      }
    } catch (e: any) {
      toast.error(e.message || "שגיאה");
    } finally { setSaving(false); }
  }

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-secondary/40 to-accent/30">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <BrandLogo size={80} className="mx-auto mb-4 rounded-3xl" />
          <h1 className="text-2xl font-bold">בחר/י את הצוות שלך</h1>
          <p className="text-muted-foreground mt-2 text-sm">בחירת הצוות מתבצעת פעם אחת ונשמרת לחשבונך.</p>
        </div>
        <Card className="p-6 shadow-xl space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue placeholder="בחר/י צוות" /></SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!teamId || saving} onClick={onContinue} className="w-full h-11">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "המשך לחנות"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/", replace: true });
              }}>
                <LogOut className="w-4 h-4 ml-2" /> יציאה
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
