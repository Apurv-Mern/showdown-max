#!/usr/bin/env node
/**
 * One-time migration: upload local files from UPLOAD_DIR to S3 and optionally
 * update questions.mediaUrl to the new public S3 URLs.
 *
 * Usage (from repo root):
 *   npm run migrate:uploads-to-s3
 *   npm run migrate:uploads-to-s3 -- --update-db
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../..');
const serverRoot = path.resolve(__dirname, '..');

const resolveUploadDir = (configuredDir) => {
  const candidates = [
    path.resolve(repoRoot, configuredDir || 'uploads'),
    path.resolve(serverRoot, configuredDir || 'uploads'),
    path.resolve(serverRoot, 'uploads'),
    path.resolve(repoRoot, 'uploads'),
  ];
  return (
    candidates.find(
      (dir) => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f !== '.gitkeep'),
    ) || candidates[0]
  );
};

const updateDb = process.argv.includes('--update-db');

async function main() {
  const { env } = require(path.join(serverRoot, 'src/config/env'));
  const s3Storage = require(path.join(serverRoot, 'src/services/storage/s3Storage'));

  if (env.STORAGE_BACKEND !== 's3') {
    console.error('STORAGE_BACKEND must be "s3". Set it in .env / .env.production first.');
    process.exit(1);
  }

  const uploadDir = resolveUploadDir(env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) {
    console.log('No upload directory found.');
    return;
  }

  const filenames = fs
    .readdirSync(uploadDir)
    .filter((name) => name !== '.gitkeep' && fs.statSync(path.join(uploadDir, name)).isFile());

  if (!filenames.length) {
    console.log('No local files to migrate.');
    return;
  }

  console.log(`Using upload dir: ${uploadDir}`);
  console.log(`Migrating ${filenames.length} file(s) to s3://${env.S3_BUCKET}/${env.S3_KEY_PREFIX}`);

  const urlMap = new Map();

  for (const filename of filenames) {
    const filepath = path.join(uploadDir, filename);
    const buffer = fs.readFileSync(filepath);
    const result = await s3Storage.saveFile({ filename, buffer });
    urlMap.set(filename, result.url);
    console.log(`Uploaded: ${filename} -> ${result.url}`);
  }

  if (!updateDb) {
    console.log('\nDone. Re-run with --update-db to rewrite questions.mediaUrl in MySQL.');
    return;
  }

  const { Question } = require(path.join(serverRoot, 'src/models'));
  const { filenameFromMediaUrl } = require(path.join(serverRoot, 'src/services/mediaReferenceService'));
  const { Op } = require('sequelize');

  const questions = await Question.findAll({
    where: { mediaUrl: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
    attributes: ['id', 'mediaUrl'],
  });

  let updated = 0;
  for (const q of questions) {
    const fn = filenameFromMediaUrl(q.mediaUrl);
    const newUrl = fn ? urlMap.get(fn) : null;
    if (newUrl && newUrl !== q.mediaUrl) {
      await Question.update({ mediaUrl: newUrl }, { where: { id: q.id } });
      updated += 1;
      console.log(`Updated question ${q.id}: ${newUrl}`);
    }
  }

  console.log(`\nDatabase: ${updated} question(s) updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
