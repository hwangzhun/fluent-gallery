import FingerprintJS from '@fingerprintjs/fingerprintjs';

const FINGERPRINT_KEY = 'fluent_gallery_fingerprint';

let fingerprint: string | null = null;
let fingerprintPromise: Promise<string> | null = null;

export async function getVisitorFingerprint(): Promise<string> {
  if (fingerprint) return fingerprint;

  const savedFingerprint = localStorage.getItem(FINGERPRINT_KEY);
  if (savedFingerprint) {
    fingerprint = savedFingerprint;
    return savedFingerprint;
  }

  if (fingerprintPromise) return fingerprintPromise;

  fingerprintPromise = (async () => {
    try {
      const agent = await FingerprintJS.load();
      fingerprint = (await agent.get()).visitorId;
    } catch (error) {
      console.error('生成浏览器指纹失败:', error);
      fingerprint = `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    } finally {
      fingerprintPromise = null;
    }

    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
    return fingerprint;
  })();

  return fingerprintPromise;
}
