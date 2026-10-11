/** Expand path templates like `/web_api/get_replay_channel/{channel}` from the request body. */

export type ExpandableRoute = {
  path: string;
  pathParams?: string[];
};

export function expandRoutePath(
  route: ExpandableRoute,
  body: Record<string, unknown> | null | undefined,
): { pathName: string; body: Record<string, unknown> } {
  const template = route.path || '';
  const pathParams = Array.isArray(route.pathParams) ? route.pathParams : [];
  const payload = body && typeof body === 'object' ? { ...body } : {};
  if (!template.includes('{')) {
    return { pathName: template, body: payload };
  }
  const pathName = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    let value = payload[key];
    if (value == null && key === 'id') value = payload.highlight_id;
    if (value == null) {
      throw new Error(`Missing path param ${key} for ${template}`);
    }
    delete payload[key];
    if (key === 'id') delete payload.highlight_id;
    return encodeURIComponent(String(value));
  });
  for (const key of pathParams) {
    delete payload[key];
  }
  return { pathName, body: payload };
}
