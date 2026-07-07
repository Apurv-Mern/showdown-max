const { env } = require('../../config/env');
const localStorage = require('./localStorage');
const s3Storage = require('./s3Storage');

const storage = env.STORAGE_BACKEND === 's3' ? s3Storage : localStorage;

module.exports = storage;
