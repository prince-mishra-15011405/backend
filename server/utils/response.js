/**
 * Standardized API Response Utilities
 */

/**
 * Send a successful API response.
 * @param {import('express').Response} res
 * @param {any} data - Response payload
 * @param {number} statusCode - HTTP status code (default: 200)
 * @param {Object} extraFields - Optional extra top-level fields (e.g. query, meta)
 */
function sendSuccess(res, data, statusCode = 200, extraFields = {}) {
  return res.status(statusCode).json({
    success: true,
    ...extraFields,
    data
  });
}

/**
 * Send a formatted error API response.
 * @param {import('express').Response} res
 * @param {string} code - Error code identifier (e.g. "ROUTE_NOT_FOUND")
 * @param {string} message - Human-readable error message
 * @param {number} statusCode - HTTP status code (default: 400)
 */
function sendError(res, code, message, statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message
    }
  });
}

module.exports = {
  sendSuccess,
  sendError
};
