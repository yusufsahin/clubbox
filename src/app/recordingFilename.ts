export function recordingFilename(
  topic: string | undefined,
  kind: 'recording' | 'clip' = 'recording',
): string {
  const slug = (topic || 'room')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'room';
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const extension = kind === 'clip' ? 'wav' : 'webm';
  return `clubbox-${kind}-${slug}-${stamp}.${extension}`;
}
