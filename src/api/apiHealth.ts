export type ApiHealthFailure = {
  endpoint: string;
  method: string;
  status: number;
  message: string;
  bodyKeys: string[];
  time: string;
};

export type RedactedRequestLogEntry = {
  endpoint: string;
  method: string;
  path: string;
  status: number;
  bodyKeys: string[];
  evidence: string;
  appVersion: string;
  timestamp: string;
};

/** Redacted clipboard / report text — keys only, never values. */
export function formatHealthReport(failure: ApiHealthFailure): string {
  return [
    `endpoint=${failure.endpoint}`,
    `method=${failure.method}`,
    `status=${failure.status}`,
    `body_keys=${failure.bodyKeys.join(',')}`,
    `error=${failure.message}`,
  ].join('\n');
}

export function reportLooksSafe(report: string): boolean {
  return !/token|cookie|phone|\+1|@|\bname=/i.test(report);
}

export class ApiHealthStore {
  readonly failures: ApiHealthFailure[] = [];
  readonly requestLog: RedactedRequestLogEntry[] = [];

  recordFailure(entry: ApiHealthFailure): void {
    this.failures.push(entry);
  }

  recordSuccess(entry: RedactedRequestLogEntry): void {
    this.requestLog.push(entry);
  }

  copyReport(index = this.failures.length - 1): string {
    const failure = this.failures[index];
    if (!failure) return '';
    return formatHealthReport(failure);
  }

  reset(): void {
    this.failures.length = 0;
  }
}
