'use strict';

function wrapAsync(handler) {
  if (typeof handler !== 'function' || handler.constructor?.name !== 'AsyncFunction') return handler;
  return function asyncExpressHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createAsyncRouter(express) {
  const router = express.Router();
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
    const register = router[method].bind(router);
    router[method] = (...args) => register(...args.map(wrapAsync));
  }
  return router;
}

module.exports = { wrapAsync, createAsyncRouter };
