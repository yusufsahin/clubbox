import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApiTransport, RequestBody } from '../../src/api/client.ts';

export type RecordedRequest = {
  endpoint: string;
  method: string;
  path: string;
  body: RequestBody | null | undefined;
  headers: Record<string, string>;
};

type StatusPlan = { status: number; remaining: number };

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

function loadFixtures(): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!existsSync(fixturesDir)) return map;
  for (const name of readdirSync(fixturesDir)) {
    if (!name.endsWith('.json')) continue;
    const endpoint = name.replace(/\.json$/, '');
    map.set(endpoint, JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')));
  }
  return map;
}

export class FakeTransport implements ApiTransport {
  readonly requests: RecordedRequest[] = [];
  private readonly fixtures = loadFixtures();
  private readonly statusPlans = new Map<string, StatusPlan[]>();

  willAnswer(endpoint: string, status: number, times = 1): void {
    const queue = this.statusPlans.get(endpoint) ?? [];
    queue.push({ status, remaining: times });
    this.statusPlans.set(endpoint, queue);
  }

  setFixture(endpoint: string, body: unknown): void {
    this.fixtures.set(endpoint, body);
  }

  clearRequests(): void {
    this.requests.length = 0;
  }

  requestsNamed(endpointOrPath: string): RecordedRequest[] {
    return this.requests.filter(
      (req) => req.endpoint === endpointOrPath || req.path === endpointOrPath || req.path.endsWith(`/${endpointOrPath}`),
    );
  }

  async request(input: {
    endpoint: string;
    method: string;
    path: string;
    body?: RequestBody | null;
    headers: Record<string, string>;
  }): Promise<{ ok: boolean; status: number; body: string }> {
    this.requests.push({
      endpoint: input.endpoint,
      method: input.method,
      path: input.path,
      body: input.body,
      headers: input.headers,
    });

    const planQueue = this.statusPlans.get(input.endpoint);
    if (planQueue && planQueue.length > 0) {
      const plan = planQueue[0];
      plan.remaining -= 1;
      if (plan.remaining <= 0) planQueue.shift();
      const status = plan.status;
      const ok = status >= 200 && status < 300;
      const payload = ok
        ? (this.fixtures.get(input.endpoint) ?? { success: true })
        : { success: false, error_message: `HTTP ${status}` };
      return { ok, status, body: JSON.stringify(payload) };
    }

    const fixture = this.fixtures.get(input.endpoint) ?? { success: true };
    return { ok: true, status: 200, body: JSON.stringify(fixture) };
  }
}
