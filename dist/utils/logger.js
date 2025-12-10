"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChildLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const config_js_1 = require("../core/config.js");
const { combine, timestamp, printf, colorize, json } = winston_1.default.format;
const textFormat = printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
});
function createLogger() {
    let loggingConfig;
    try {
        loggingConfig = (0, config_js_1.getConfigValue)('logging');
    }
    catch {
        // Default logging config if config not yet loaded
        loggingConfig = { level: 'info', format: 'text' };
    }
    const transports = [
        new winston_1.default.transports.Console({
            format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), loggingConfig.format === 'json' ? json() : textFormat),
        }),
    ];
    if (loggingConfig.file) {
        transports.push(new winston_1.default.transports.File({
            filename: loggingConfig.file,
            format: combine(timestamp(), json()),
        }));
    }
    return winston_1.default.createLogger({
        level: loggingConfig.level,
        transports,
    });
}
exports.logger = createLogger();
const createChildLogger = (module) => {
    return exports.logger.child({ module });
};
exports.createChildLogger = createChildLogger;
//# sourceMappingURL=logger.js.map