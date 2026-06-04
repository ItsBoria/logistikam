// Browser-side helpers for Web Push (no DOM components here)

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
}

export function isStandaloneInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  // @ts-ignore iOS
  const iosStandalone = typeof navigator !== "undefined" && (navigator as any).standalone === true;
  return !!(mq || iosStandalone);
}

// Convert a base64url VAPID public key to a Uint8Array (no character stripping)
export function vapidKeyToUint8Array(base64Url: string): Uint8Array {
  if (!base64Url || typeof base64Url !== "string") {
    throw new Error("מפתח VAPID חסר");
  }
  const trimmed = base64Url.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error("מפתח VAPID לא תקין (תווים לא חוקיים)");
  }
  const padding = "=".repeat((4 - (trimmed.length % 4)) % 4);
  const base64 = (trimmed + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  if (arr.length !== 65) {
    throw new Error(`מפתח VAPID לא תקין (אורך ${arr.length} במקום 65 בתים)`);
  }
  return arr;
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return await reg.pushManager.getSubscription();
}

export async function registerSW(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}
