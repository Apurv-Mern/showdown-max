const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');
const { contentTypeForFilename } = require('../../utils/mediaMime');

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const objectKey = (filename) => `${env.S3_KEY_PREFIX}${filename}`;

const getPublicUrl = (filename) => {
  const base = env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${base}/${objectKey(filename)}`;
};

const saveFile = async ({ filename, buffer, contentType }) => {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: objectKey(filename),
      Body: buffer,
      ContentType: contentType || contentTypeForFilename(filename),
    }),
  );

  logger.info('File saved to S3', { filename, bucket: env.S3_BUCKET, size: buffer.length });

  return {
    filename,
    url: getPublicUrl(filename),
  };
};

const deleteFile = async (filename) => {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey(filename),
      }),
    );
    logger.info('File deleted from S3', { filename, bucket: env.S3_BUCKET });
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
};

const listFiles = async () => {
  const items = [];
  let continuationToken;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: env.S3_KEY_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents || []) {
      if (!object.Key || object.Key.endsWith('/')) continue;

      const filename = object.Key.slice(env.S3_KEY_PREFIX.length);
      if (!filename) continue;

      const ext = filename.split('.').pop()?.toLowerCase() || '';

      items.push({
        filename,
        url: getPublicUrl(filename),
        mediaType: ext,
        size: object.Size || 0,
        createdAt: object.LastModified || new Date(),
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
};

const fileExists = async (filename) => {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey(filename),
      }),
    );
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw err;
  }
};

const getFileStream = async (filename) => {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey(filename),
      }),
    );

    if (!response.Body) return null;

    return {
      stream: response.Body,
      contentType: response.ContentType || contentTypeForFilename(filename),
    };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
};

module.exports = {
  saveFile,
  deleteFile,
  listFiles,
  fileExists,
  getFileStream,
  getPublicUrl,
};
