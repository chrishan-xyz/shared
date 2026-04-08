"use strict";
/**
 * Request ID middleware — cross-service correlation.
 *
 * Accepts incoming `X-Request-Id` header (for tracing across services),
 * or generates a new short UUID via `crypto.randomUUID()`.
 *
 * Sets `req._requestId` and `X-Request-Id` response header.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = requestId;
const crypto_1 = require("crypto");
function requestId() {
    return (req, res, next) => {
        var _a;
        const id = ((_a = req.headers['x-request-id']) === null || _a === void 0 ? void 0 : _a.slice(0, 64))
            || crypto_1.default.randomUUID().slice(0, 8);
        req._requestId = id;
        res.setHeader('X-Request-Id', id);
        next();
    };
}
