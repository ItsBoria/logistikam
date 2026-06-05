import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getExistingSubscription,
  isIOSDevice,
  isPushSupported,
  isStandaloneInstalled,
  registerSW,
  vapidKeyToUint8Array,
} from "@/lib/push-client";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push.functions";

export function PushToggle({ pin }: { pin: string }) {
  const vapidFn = useServerFn(getVapidPublicKey);
  const subscribeFn = useServerFn(subscribePush);
  const unsubscribeFn = useServerFn(unsubscribePush);

  const [supported, setSupported] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sup = isPushSupported();
    setSupported(sup);
    setIosNeedsInstall(isIOSDevice() && !isStandaloneInstalled() && !sup);
    if (sup) getExistingSubscription().then((s) => setOn(!!s));
  }, []);

  async function enable() {
    if (!supported) {
      toast.error(
        iosNeedsInstall
          ? "ב‑iPhone יש להוסיף את האתר למסך הבית (שתף → הוסף למסך הבית) ולפתוח משם"
          : "הדפדפן לא תומך בהתראות"
      );
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("ההרשאה להתראות נדחתה");
        return;
      }
      const res = await vapidFn();
      if (!res.key) {
        toast.error(res.error || "התראות לא מוגדרות במערכת");
        return;
      }
      const appServerKey = vapidKeyToUint8Array(res.key);
      const reg = await registerSW();
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        // existing sub may be tied to old key — drop it
        try { await sub.unsubscribe(); } catch (_) {}
        sub = null;
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey.buffer.slice(appServerKey.byteOffset, appServerKey.byteOffset + appServerKey.byteLength) as ArrayBuffer,
      });
      const json: any = sub.toJSON();
      await subscribeFn({
        data: {
          pin,
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      });
      setOn(true);
      toast.success("התראות הופעלו 🎉");
    } catch (e: any) {
      console.error("[push] enable failed", e);
      toast.error(e?.message || "שגיאה בהפעלת התראות");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFn({ data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setOn(false);
      toast.success("התראות כובו");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  if (iosNeedsInstall) {
    return (
      <Button variant="outline" size="sm" onClick={enable}>
        <Bell className="w-4 h-4 ml-2" /> הפעל התראות
      </Button>
    );
  }

  if (!supported) {
    return (
      <Button variant="outline" size="sm" disabled>
        <BellOff className="w-4 h-4 ml-2" /> לא נתמך
      </Button>
    );
  }

  if (busy) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="w-4 h-4 ml-2 animate-spin" /> רגע...
      </Button>
    );
  }

  return on ? (
    <Button variant="outline" size="sm" onClick={disable}>
      <BellOff className="w-4 h-4 ml-2" /> כבה התראות
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={enable}>
      <Bell className="w-4 h-4 ml-2" /> הפעל התראות
    </Button>
  );
}
