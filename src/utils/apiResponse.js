// src/utils/apiResponse.js
// Shared JSON response helpers. Keep payload shape compatible with the existing frontend.

function ok(res, data = {}, message = null, statusCode = 200) {
    const payload = { success: true, ...data };
    if (message) payload.message = message;
    return res.status(statusCode).json(payload);
}

function created(res, data = {}, message = 'با موفقیت ثبت شد') {
    return ok(res, data, message, 201);
}

function fail(res, message = 'درخواست نامعتبر است', statusCode = 400, data = {}) {
    return res.status(statusCode).json({ success: false, message, ...data });
}

function notFound(res, message = 'موردی یافت نشد') {
    return fail(res, message, 404);
}

module.exports = {
    ok,
    created,
    fail,
    notFound
};
