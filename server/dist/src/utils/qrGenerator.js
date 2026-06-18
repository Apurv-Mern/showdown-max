const QRCode = require('qrcode');

/**
 * Generates a QR code data URL for a given session URL
 * @param {string} url - The URL to encode
 * @returns {Promise<string>} Base64 data URL of the QR code
 */
const generateQRCode = async (url) => {
  const dataUrl = await QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: {
      dark: '#FFFFFF',
      light: '#00000000',
    },
  });
  return dataUrl;
};

module.exports = { generateQRCode };
