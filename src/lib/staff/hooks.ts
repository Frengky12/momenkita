import { useMemo, useSyncExternalStore } from "react";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

const noop = () => () => {};

// Jam yang berdetak per detik hanya saat dibutuhkan (hitung mundur mode jeda), agar daftar tidak dirender ulang terus.
export function useSecondClock(active: boolean) {
  const subscribe = useMemo(
    () =>
      active
        ? (callback: () => void) => {
            const id = setInterval(callback, 1000);
            return () => clearInterval(id);
          }
        : noop,
    [active],
  );
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 1000) * 1000, () => 0);
}
