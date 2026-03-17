const crypto = require('crypto');

/**
 * Generates a random host token (64-char hex string)
 * @returns {string}
 */
const generateHostToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = { generateHostToken };
