import { PROTOCOL_VERSION } from './protocol';

const REQUEST_TIMEOUT_MS = 8_000;
const STARTUP_TIMEOUT_MS = 90_000;
const RETRY_INTERVAL_MS = 2_000;

export async function loadGameServerUrl(): Promise<URL> {
  if (import.meta.env.DEV) {
    const override = new URLSearchParams(window.location.search).get('server');
    return new URL(override || 'ws://127.0.0.1:8787/ws');
  }

  try {
    const response = await fetch(new URL('./server-config.json', window.location.href), {
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error();
    const config = await response.json();
    const url = new URL(config.serverUrl);
    if (url.protocol !== 'wss:' || url.pathname !== '/ws' || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error('対戦サーバーの設定を読み込めませんでした。投稿者にお問い合わせください。');
  }
}

export async function waitForGameServer(socketUrl: URL): Promise<void> {
  const healthUrl = new URL('/health', socketUrl);
  healthUrl.protocol = socketUrl.protocol === 'wss:' ? 'https:' : 'http:';
  const deadline = performance.now() + STARTUP_TIMEOUT_MS;

  while (performance.now() < deadline) {
    const remaining = deadline - performance.now();
    const health = await fetch(healthUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(Math.max(1, Math.floor(Math.min(remaining, REQUEST_TIMEOUT_MS)))),
    }).then((response) => response.ok ? response.json() : null).catch(() => null);

    if (health?.ok === true && health.service === 'bannerfall-server') {
      if (health.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error('ゲームと対戦サーバーのバージョンが異なります。ページを再読み込みしてください。');
      }
      return;
    }

    const delay = Math.min(RETRY_INTERVAL_MS, deadline - performance.now());
    if (delay > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
  }

  throw new Error('対戦サーバーの応答を確認できませんでした。少し待ってからもう一度お試しください。');
}
