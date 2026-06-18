import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Home, ClipboardList, MoreHorizontal, Replace, LogOut } from "lucide-react";
import { setTeamSession } from "@/lib/team-session";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PushToggle } from "@/components/push-toggle";
import { InstallButton } from "@/components/install-button";

type Item = { to: string; label: string; icon: any; exact?: boolean };

const SHOP_ITEMS: Item[] = [
  { to: "/shop", label: "חנות", icon: Home, exact: true },
  { to: "/shop/replacements", label: "החלפות", icon: Replace },
  { to: "/shop/orders", label: "הזמנות", icon: ClipboardList },
];

function useIsActive() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");
}

function Tab({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to as any}
      className={[
        "group relative flex items-center justify-center gap-2 rounded-full transition-all",
        "h-11 px-3 min-w-11",
        active
          ? "bg-primary text-primary-foreground shadow-sm px-4"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      ].join(" ")}
      aria-label={item.label}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span
        className={[
          "text-xs font-medium whitespace-nowrap",
          active ? "inline" : "hidden md:group-hover:inline",
        ].join(" ")}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function BottomTabBar({ pin }: { pin?: string }) {
  const navigate = useNavigate();
  const isActive = useIsActive();
  const [open, setOpen] = useState(false);

  function logout() {
    setTeamSession(null);
    setOpen(false);
    navigate({ to: "/" });
  }

  return (
    <>
      <div className="h-24" aria-hidden />
      <div className="fixed bottom-0 inset-x-0 z-40 pb-[max(env(safe-area-inset-bottom),16px)] px-4 pointer-events-none">
        <nav
          className={[
            "pointer-events-auto mx-auto w-fit max-w-[calc(100vw-2rem)]",
            "flex items-center gap-1 p-1.5 rounded-full",
            "bg-card/90 backdrop-blur-xl border shadow-lg",
          ].join(" ")}
        >
          {SHOP_ITEMS.map((it) => (
            <Tab key={it.to} item={it} active={isActive(it.to, it.exact)} />
          ))}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="group flex items-center justify-center gap-2 rounded-full transition-all h-11 px-3 min-w-11 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="עוד"
              >
                <MoreHorizontal className="w-5 h-5 shrink-0" />
                <span className="text-xs font-medium hidden md:group-hover:inline">עוד</span>
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
        </nav>
      </div>
    </>
  );
}
