// src/utils/asyncHandler.js
// Tiny wrapper for async Express handlers so route files do not repeat try/catch blocks.

module.exports = function asyncHandler(fn) {
    return function wrappedAsyncHandler(req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
