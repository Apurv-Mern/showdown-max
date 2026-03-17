/**
 * @param {object} data
 * @param {string} [message]
 * @returns {{ success: boolean, data: object, message: string }}
 */
const success = (data = null, message = 'Success') => ({
  success: true,
  data,
  message,
});

/**
 * @param {string} message
 * @param {number} [statusCode]
 * @returns {{ success: boolean, error: string, statusCode: number }}
 */
const error = (message = 'Internal Server Error', statusCode = 500) => ({
  success: false,
  error: message,
  statusCode,
});

module.exports = { success, error };
