const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
const HISTORY_COUNT = 100;

/**
 * Parse PubNub /v2/history body: [[messages…], startTt, endTt].
 * Messages may be bare payloads or { message, timetoken }.
 */
function parseHistoryBody(parsed) {
  if (!Array.isArray(parsed) || parsed.length < 3) return null;
  const [rows, start, end] = parsed;
  if (!Array.isArray(rows)) return null;
  const items = [];
  for (const row of rows) {
    if (row && typeof row === 'object' && 'message' in row) {
      const payload = row.message;
      if (payload && typeof payload === 'object') {
        items.push({
          payload,
          timetoken: row.timetoken != null ? String(row.timetoken) : null,
        });
      }
      continue;
    }
    if (row && typeof row === 'object') {
      items.push({ payload: row, timetoken: null });
    }
  }
  return {
    items,
    start: start != null ? String(start) : null,
    end: end != null ? String(end) : null,
  };
}

/**
 * Main-process PubNub REST long-poll subscriber (DESIGN §5.1).
 * On reconnect, tries /v2/history since the last timetoken when Storage allows it (30.4).
 */
function createPubNubClient(options) {
  const {
    fetchFn,
    onMessage,
    onStatus,
    setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
    clearTimeoutFn = (id) => clearTimeout(id),
    backoffMs = BACKOFF_MS,
  } = options;

  let stopped = true;
  let inflight = null;
  let loopRunning = false;
  let backoffIndex = 0;
  let reconnectTimer = null;
  let config = null;
  let subscribeKey = null;
  let timeToken = '0';
  let lastAppliedTimeToken = null;
  let region = null;
  /** null = unknown; false = Storage/history disabled for this key (stop trying). */
  let historySupported = null;
  /** Timetoken to catch up from after a reconnect gap. */
  let catchupFrom = null;

  const emitStatus = (partial) => {
    onStatus?.({
      connected: !stopped && !reconnectTimer,
      reconnecting: !!reconnectTimer,
      reconnectDelayMs: partial?.reconnectDelayMs,
      ...partial,
    });
  };

  const emitPayload = (payload, tt) => {
    if (!payload || typeof payload !== 'object') return;
    const token = tt != null && tt !== '' ? String(tt) : null;
    const out = token ? { ...payload, _pubnub_tt: token } : payload;
    onMessage?.(out);
    if (token) lastAppliedTimeToken = token;
  };

  const historyChannels = () => {
    if (!config) return [];
    const list = Array.isArray(config.channels) && config.channels.length
      ? config.channels.filter((name) => typeof name === 'string' && name.startsWith('channel_all.'))
      : [];
    if (list.length) return list.slice(0, 2);
    return [`channel_all.${config.channelId}`];
  };

  const fetchHistorySince = async (startTt) => {
    if (!config || !subscribeKey || historySupported === false) return 'skip';
    if (!startTt || startTt === '0') return 'skip';
    const origin = config.origin.replace(/^https?:\/\//, '');
    let anyOk = false;
    for (const channelName of historyChannels()) {
      const params = new URLSearchParams();
      params.set('auth', config.token);
      params.set('uuid', config.uuid);
      params.set('count', String(HISTORY_COUNT));
      params.set('start', String(startTt));
      params.set('reverse', 'false');
      const url = `https://${origin}/v2/history/${subscribeKey}/${encodeURIComponent(channelName)}/0?${params.toString()}`;
      let response;
      try {
        response = await fetchFn(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
      } catch {
        return 'error';
      }
      if (!response.ok) {
        if (response.status === 400 || response.status === 403 || response.status === 404) {
          historySupported = false;
          return 'unsupported';
        }
        return 'error';
      }
      let parsed;
      try {
        parsed = JSON.parse(await response.text());
      } catch {
        return 'error';
      }
      const body = parseHistoryBody(parsed);
      if (!body) {
        historySupported = false;
        return 'unsupported';
      }
      historySupported = true;
      anyOk = true;
      for (const item of body.items) {
        emitPayload(item.payload, item.timetoken || body.end);
      }
      if (body.end && (timeToken === '0' || String(body.end) > String(timeToken))) {
        timeToken = String(body.end);
      }
      if (body.end) lastAppliedTimeToken = String(body.end);
    }
    return anyOk ? 'ok' : 'skip';
  };

  const historyCatchup = async () => {
    if (stopped || !catchupFrom) return;
    const start = catchupFrom;
    catchupFrom = null;
    await fetchHistorySince(start);
  };

  const scheduleReconnect = (reason) => {
    if (stopped || !config) return;
    if (!catchupFrom && timeToken && timeToken !== '0') catchupFrom = timeToken;
    const delay = backoffMs[Math.min(backoffIndex, backoffMs.length - 1)];
    backoffIndex = Math.min(backoffIndex + 1, backoffMs.length - 1);
    if (reconnectTimer) clearTimeoutFn(reconnectTimer);
    emitStatus({
      connected: false,
      reconnecting: true,
      reconnectDelayMs: delay,
      reason: reason || undefined,
    });
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      void (async () => {
        await historyCatchup();
        if (!stopped) void pollLoop();
      })();
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
          const msgTt = envelope.p && envelope.p.t != null
            ? String(envelope.p.t)
            : timeToken;
          if (payload && typeof payload === 'object') emitPayload(payload, msgTt);
        }
      } else if (Array.isArray(parsed) && parsed.length >= 2) {
        const messages = parsed[0];
        const nextTt = parsed[1];
        if (nextTt != null) timeToken = String(nextTt);
        if (Array.isArray(messages)) {
          for (const envelope of messages) {
            if (!envelope || typeof envelope !== 'object') continue;
            const payload = envelope.d ?? envelope.message ?? envelope;
            const msgTt = envelope.p && envelope.p.t != null
              ? String(envelope.p.t)
              : timeToken;
            if (payload && typeof payload === 'object') emitPayload(payload, msgTt);
          }
        }
      }
      backoffIndex = 0;
      emitStatus({ connected: true, reconnecting: false });
    } catch (err) {
      if (stopped || controller.signal.aborted) return;
      const reason = err instanceof Error ? err.message : 'pubnub_error';
      scheduleReconnect(reason);
      return;
    } finally {
      inflight = null;
    }
  };

  const pollLoop = async () => {
    if (loopRunning) return;
    loopRunning = true;
    try {
      while (!stopped && config) {
        await pollOnce();
        if (stopped || reconnectTimer) break;
      }
    } finally {
      loopRunning = false;
    }
  };

  return {
    start(nextConfig, nextSubscribeKey) {
      this.stop();
      stopped = false;
      config = { ...nextConfig };
      subscribeKey = nextSubscribeKey;
      timeToken = nextConfig.timeToken ? String(nextConfig.timeToken) : '0';
      lastAppliedTimeToken = timeToken !== '0' ? timeToken : null;
      region = null;
      catchupFrom = null;
      historySupported = null;
      backoffIndex = 0;
      emitStatus({ connected: true, reconnecting: false });
      void pollLoop();
    },
    resubscribe() {
      if (!config || stopped) return;
      backoffIndex = 0;
      if (reconnectTimer) {
        clearTimeoutFn(reconnectTimer);
        reconnectTimer = null;
      }
      // Abort the in-flight long-poll so the existing loop (or a new one) continues once —
      // never start a second pollLoop while the first is still awaiting.
      if (inflight) inflight.abort();
      emitStatus({ connected: true, reconnecting: false });
      void pollLoop();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeoutFn(reconnectTimer);
        reconnectTimer = null;
      }
      if (inflight) inflight.abort();
      config = null;
      subscribeKey = null;
      catchupFrom = null;
      emitStatus({ connected: false, reconnecting: false });
    },
    isConnected() {
      return !stopped && !!config && !!subscribeKey && !reconnectTimer;
    },
    /** Last subscribe cursor (for tests / diagnostics). */
    getTimeToken() {
      return timeToken;
    },
    /** Last timetoken attached to an applied room event (30.4). */
    getLastAppliedTimeToken() {
      return lastAppliedTimeToken;
    },
    /** null unknown, true Storage ok, false disabled for this key. */
    getHistorySupported() {
      return historySupported;
    },
  };
}

module.exports = { createPubNubClient, BACKOFF_MS, parseHistoryBody, HISTORY_COUNT };
