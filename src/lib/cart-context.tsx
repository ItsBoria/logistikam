import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

export type CartMap = Record<string, number>;

type CartContextValue = {
  pin: string | null;
  cart: CartMap;
  setQty: (id: string, q: number, max?: number) => void;
  clear: () => void;
  itemCount: number;
  bumpKey: number; // changes when an item is added — for animation
  openCheckout: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(pin: string) {
  return `cart:${pin}`;
}

export function CartProvider({ children, pin }: { children: ReactNode; pin: string | null }) {
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [cart, setCart] = useState<CartMap>({});
  const [bumpKey, setBumpKey] = useState(0);
  const loadedRef = useRef<string | null>(null);

  // Load per-pin cart on pin change
  useEffect(() => {
    if (!pin) { setCart({}); loadedRef.current = null; return; }
    if (loadedRef.current === pin) return;
    loadedRef.current = pin;
    try {
      const raw = sessionStorage.getItem(storageKey(pin));
      setCart(raw ? JSON.parse(raw) : {});
    } catch { setCart({}); }
  }, [pin]);

  // Persist
  useEffect(() => {
    if (!pin) return;
    try { sessionStorage.setItem(storageKey(pin), JSON.stringify(cart)); } catch {}
  }, [cart, pin]);

  const setQty = useCallback((id: string, q: number, max?: number) => {
    const v = Math.max(0, Math.min(max ?? Infinity, q));
    setCart((c) => {
      const prev = c[id] || 0;
      const n = { ...c };
      if (v === 0) delete n[id]; else n[id] = v;
      if (v > prev) setBumpKey((k) => k + 1);
      return n;
    });
  }, []);

  const clear = useCallback(() => setCart({}), []);

  const openCheckout = useCallback(() => {
    if (path.startsWith("/shop") && path === "/shop") {
      window.dispatchEvent(new CustomEvent("open-checkout"));
    } else {
      navigate({ to: "/shop", search: { cart: "1" } as any });
    }
  }, [navigate, path]);

  const itemCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);

  const value: CartContextValue = { pin, cart, setQty, clear, itemCount, bumpKey, openCheckout };
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const v = useContext(CartContext);
  if (!v) throw new Error("useCart must be used inside CartProvider");
  return v;
}

export function useOptionalCart() {
  return useContext(CartContext);
}
