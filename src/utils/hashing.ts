import { createHash } from 'crypto';

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hashObject(obj: Record<string, unknown>): string {
  return hashContent(JSON.stringify(obj));
}

export function generateDocumentId(filePath: string, chunkIndex: number): string {
  return hashContent(`${filePath}:${chunkIndex}`).slice(0, 16);
}
