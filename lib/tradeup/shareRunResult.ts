import { Capacitor } from '@capacitor/core';

const SHARE_FILE_NAME = '1b-run-result.png';

export type ShareRunResult =
  | { ok: true }
  | { ok: false; cancelled: boolean; message: string };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read share image'));
        return;
      }
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('Could not read share image'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read share image'));
    reader.readAsDataURL(blob);
  });
}

function shareErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? 'Could not share');
  }
  return 'Could not share';
}

function isShareCancelled(err: unknown): boolean {
  return /cancel|dismiss|abort/i.test(shareErrorMessage(err));
}

/** PNG of the on-screen results card (total + five players). */
export async function captureRunShareCard(node: HTMLElement): Promise<Blob | null> {
  try {
    const { toBlob } = await import('html-to-image');
    return await toBlob(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#03143a',
      skipAutoScale: true,
    });
  } catch {
    return null;
  }
}

async function shareViaNativeSheet(blob: Blob): Promise<ShareRunResult> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: SHARE_FILE_NAME,
      data: base64,
      directory: Directory.Cache,
    });
    await Share.share({
      title: '1B RUN',
      dialogTitle: 'Share your run',
      files: [written.uri],
    });
    return { ok: true };
  } catch (err) {
    if (isShareCancelled(err)) {
      return { ok: false, cancelled: true, message: 'Share cancelled' };
    }
    return { ok: false, cancelled: false, message: shareErrorMessage(err) };
  }
}

async function shareViaWeb(blob: Blob): Promise<ShareRunResult> {
  const file = new File([blob], SHARE_FILE_NAME, { type: 'image/png' });

  if (typeof navigator !== 'undefined' && navigator.share) {
    const payload: ShareData = { files: [file] };
    try {
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        return { ok: true };
      }
    } catch (err) {
      if (isShareCancelled(err)) {
        return { ok: false, cancelled: true, message: 'Share cancelled' };
      }
      return { ok: false, cancelled: false, message: shareErrorMessage(err) };
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = SHARE_FILE_NAME;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, cancelled: false, message: 'Could not save image' };
  }
}

/** Save PNG to cache and open the native share sheet (no web-intent URLs). */
export async function shareRunResultImage(blob: Blob): Promise<ShareRunResult> {
  if (Capacitor.isNativePlatform()) {
    return shareViaNativeSheet(blob);
  }
  return shareViaWeb(blob);
}
