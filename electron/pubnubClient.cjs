const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];

/**
 * Main-process PubNub REST long-poll subscriber (DESIGN §5.1).
 */
function createPubNubClient(options) {
  const {
    fetchFn,
    onMessage,
    onStatus,
  } = options;

  let stopped = true;
  let inflight = null;
  let backoffIndex = 0;
  let reconnectTimer = null;
  let config = null;
  let subscribeKey = null;
  let timeToken = '0';
  let region = null;

  const emitStatus = (partial) => {
    onStatus?.({
      connected: !stopped && !reconnectTimer,
      reconnecting: !!reconnectTimer,
      reconnectDelayMs: partial?.reconnectDelayMs,
      ...partial,
    });
  };

  const scheduleReconnect = () => {
    if (stopped || !config) return;
    const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
    backoffIndex = Math.min(backoffIndex + 1, BACKOFF_MS.length - 1);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    emitStatus({ connected: false, reconnecting: true, reconnectDelayMs: delay });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void pollLoop();
    }, delay);
  };

  const buildUrl = () => {
    const origin = config.origin.replace(/^https?:\/\//, '');
    // Room channels as the official clients use them; a bare room id is not a Clubhouse channel.
    const list = Array.isArray(config.channels) && config.channels.length
      ? config.channels
      : [`channel_all.${config.channelId}`];
    const channel = list.map((name) => encodeURIComponent(name)).join(',');
    const params = new URLSearchParams();
    params.set('auth', config.token);
    params.set('uuid', config.uuid);
    if (config.heartbeat != null) params.set('heartbeat', String(config.heartbeat));
    if (timeToken) params.set('tt', String(timeToken));
    if (region != null) params.set('tr', String(region));
    return `https://${origin}/v2/subscribe/${subscribeKey}/${channel}/0?${params.toString()}`;
  };

  const pollOnce = async () => {
    if (stopped || !config || !subscribeKey) return;
    const url = buildUrl();
    const controller = new globalThis.AbortController();
    inflight = controller;
    try {
      const response = await fetchFn(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`PubNub HTTP ${response.status}`);
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('PubNub invalid JSON');
      }
      if (parsed && !Array.isArray(parsed) && typeof parsed === 'object' && parsed.t) {
        // v2 subscribe: { t: { t: timetoken, r: region }, m: [ { c: channel, d: payload } ] }
        if (parsed.t.t != null) timeToken = String(parsed.t.t);
        if (parsed.t.r != null) region = parsed.t.r;
        for (const envelope of Array.isArray(parsed.m) ? parsed.m : []) {
          if (!envelope || typeof envelope !== 'object') continue;
          const payload = envelope.d;
          if (payload && typeof payload === 'object') onMessage?.(payload);
        }
      } else if (Array.isArray(parsed) && parsed.length >= 2) {
        const messages = parsed[0];
        const nextTt = parsed[1];
        if (nextTt != null) timeToken = String(nextTt);
        if (Array.isArray(messages)) {
          for (const envelope of messages) {
            if (!envelope || typeof envelope !== 'object') continue;
            const payload = envelope.d ?? envelope.message ?? envelope;
            if (payload && typeof payload === 'object') onMessage?.(payload);
          }
        }
      }
      backoffIndex = 0;
      emitStatus({ connected: true, reconnecting: false });
    } catch {
      if (stopped || controller.signal.aborted) return;
      scheduleReconnect();
      return;
    } finally {
      inflight = null;
    }
  };

  const pollLoop = async () => {
    while (!stopped && config) {
      await pollOnce();
      if (stopped || reconnectTimer) break;
    }
  };

  return {
    start(nextConfig, nextSubscribeKey) {
      this.stop();
      stopped = false;
      config = { ...nextConfig };
      subscribeKey = nextSubscribeKey;
      timeToken = nextConfig.timeToken ? String(nextConfig.timeToken) : '0';
      region = null;
      backoffIndex = 0;
      emitStatus({ connected: true, reconnecting: false });
      void pollLoop();
    },
    resubscribe() {
      if (!config || stopped) return;
      backoffIndex = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      emitStatus({ connected: true, reconnecting: false });
      void pollLoop();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (inflight) inflight.abort();
      config = null;
      subscribeKey = null;
      emitStatus({ connected: false, reconnecting: false });
    },
  };
}

module.exports = { createPubNubClient, BACKOFF_MS };
