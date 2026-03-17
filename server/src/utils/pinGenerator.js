const crypto = require('crypto');

/**
 * Generates a random 6-digit PIN
 * @returns {string} 6-digit PIN string
 */
const generatePin = () => {
  const pin = crypto.randomInt(100000, 999999);
  return pin.toString();
};

module.exports = { generatePin };
