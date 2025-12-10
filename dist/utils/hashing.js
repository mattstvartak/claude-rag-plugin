"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashContent = hashContent;
exports.hashObject = hashObject;
exports.generateDocumentId = generateDocumentId;
const crypto_1 = require("crypto");
function hashContent(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex');
}
function hashObject(obj) {
    return hashContent(JSON.stringify(obj));
}
function generateDocumentId(filePath, chunkIndex) {
    return hashContent(`${filePath}:${chunkIndex}`).slice(0, 16);
}
//# sourceMappingURL=hashing.js.map