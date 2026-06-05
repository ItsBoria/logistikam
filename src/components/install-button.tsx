import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { isIOSDevice, isStandaloneInstalled } from "@/lib/push-client";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallButton() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandaloneInstalled()) {
      setInstalled(true);
      return;
    }
    setIos(isIOSDevice());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (ios) {
    return (
      <Button
        variant="outline"
        className="w-full justify-start h-12"
        onClick={() =>
          toast.info(
            "ב‑iPhone: לחצו על כפתור השיתוף בספארי → 'הוסף למסך הבית', ופתחו את האפליקציה מהמסך הבית"
          )
        }
      >
        <Smartphone className="w-4 h-4 ml-2" /> הוסף למסך הבית
      </Button>
    );
  }

  if (!evt) return null;

  return (
    <Button
      variant="outline"
      className="w-full justify-start h-12"
      onClick={async () => {
        try {
          await evt.prompt();
          const { outcome } = await evt.userChoice;
          if (outcome === "accepted") setInstalled(true);
          setEvt(null);
        } catch {
          /* noop */
        }
      }}
    >
      <Smartphone className="w-4 h-4 ml-2" /> הוסף למסך הבית
    </Button>
  );
}
