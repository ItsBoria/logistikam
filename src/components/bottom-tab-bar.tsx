import { Link, useNavigate } from "@tanstack/react-router";
import { Home, ClipboardList, MoreHorizontal, Replace, LogOut } from "lucide-react";
import { useState } from "react";
import { setTeamSession } from "@/lib/team-session";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PushToggle } from "@/components/push-toggle";
import { InstallButton } from "@/components/install-button";

function Tab({
  to, label, icon: Icon, exact,
}: { to: string; label: string; icon: any; exact?: boolean }) {
  return (
    <Link
      to={to as any}
      activeOptions={{ exact }}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground data-[status=active]:text-primary"
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export function BottomTabBar({ pin }: { pin?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function logout() {
    setTeamSession(null);
    setOpen(false);
    navigate({ to: "/" });
  }

  return (
    <>
      <div className="h-16" aria-hidden />
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur border-t shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-3xl mx-auto flex items-stretch">
          <Tab to="/shop" label="בית" icon={Home} exact />
          <Tab to="/shop/replacements" label="החלפות" icon={Replace} />
          <Tab to="/shop/orders" label="הזמנות שלי" icon={ClipboardList} />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] text-muted-foreground">
                <MoreHorizontal className="w-5 h-5" />
                <span className="font-medium">עוד</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl">
              <SheetHeader><SheetTitle>עוד</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-2">
                <InstallButton />
                {pin && (
                  <div className="[&>button]:w-full [&>button]:justify-start [&>button]:h-12">
                    <PushToggle pin={pin} />
                  </div>
                )}
                <Button variant="outline" className="w-full justify-start h-12" onClick={logout}>
                  <LogOut className="w-4 h-4 ml-2" /> יציאה
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </>
  );
}
