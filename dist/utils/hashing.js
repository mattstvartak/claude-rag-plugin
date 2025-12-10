import { createHash } from 'crypto';
export function hashContent(content) {
    return createHash('sha256').update(content).digest('hex');
}
export function hashObject(obj) {
    return hashContent(JSON.stringify(obj));
}
export function generateDocumentId(filePath, chunkIndex) {
    return hashContent(`${filePath}:${chunkIndex}`).slice(0, 16);
}
//# sourceMappingURL=hashing.js.map