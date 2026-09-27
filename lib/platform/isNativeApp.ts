import { Capacitor } from '@capacitor/core';

/** True only inside a Capacitor native shell — never infer from viewport or mobile browsers. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
