const fs = require('fs');
const path = require('path');
const { env } = require('./env');
const logger = require('../utils/logger');

const getSSLConfig = () => {
  if (env.NODE_ENV === 'development') {
    logger.info('SSL: Development mode - HTTP only');
    return null;
  }

  if (env.NODE_ENV === 'production') {
    try {
      const sslDir = path.resolve(__dirname, '../../../ssl');
      const keyPath = path.join(sslDir, 'ssl_26.key');
      const certPath = path.join(sslDir, 'ssl_26.cert');
      const caPath = path.join(sslDir, 'ca_26.cert');

      if (!fs.existsSync(keyPath)) {
        throw new Error(`SSL key file not found: ${keyPath}`);
      }

      if (!fs.existsSync(certPath)) {
        throw new Error(`SSL certificate file not found: ${certPath}`);
      }

      const sslConfig = {
        key: fs.readFileSync(keyPath, 'utf8'),
        cert: fs.readFileSync(certPath, 'utf8'),
      };

      if (fs.existsSync(caPath)) {
        sslConfig.ca = fs.readFileSync(caPath, 'utf8');
      }

      logger.info('SSL: Production mode - HTTPS enabled');
      return sslConfig;
    } catch (err) {
      logger.error('Failed to load SSL certificates', { error: err.message });
      throw err;
    }
  }

  return null;
};

module.exports = { getSSLConfig };
