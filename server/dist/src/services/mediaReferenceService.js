const path = require('path');
const { Op } = require('sequelize');
const { Question, Round, Quiz } = require('../models');
const mediaService = require('./mediaService');

/**
 * Extract stored upload filename from a question mediaUrl (relative or absolute).
 * @param {string | null | undefined} mediaUrl
 * @returns {string | null}
 */
const filenameFromMediaUrl = (mediaUrl) => {
  if (!mediaUrl || typeof mediaUrl !== 'string') return null;
  let u = mediaUrl.trim().replace(/\\/g, '/');
  const apiIdx = u.toLowerCase().indexOf('/api/');
  if (apiIdx >= 0) u = u.slice(apiIdx);
  const filesMatch = u.match(/\/(?:public\/)?media\/files\/([^/?#]+)$/i);
  if (filesMatch) return decodeURIComponent(filesMatch[1]);
  // S3 / CloudFront URLs: .../media/{filename} or .../{filename}
  const s3MediaMatch = u.match(/\/media\/([^/?#]+)$/i);
  if (s3MediaMatch) return decodeURIComponent(s3MediaMatch[1]);
  const tail = u.match(/\/([^/?#]+)$/);
  return tail ? decodeURIComponent(tail[1]) : null;
};

const isAudioVideoFile = (file) => {
  const ext = path.extname(file.filename).slice(1).toLowerCase();
  const t = String(file.mediaType || ext).toLowerCase();
  return t === 'mp3' || t === 'mp4';
};

/**
 * Build map filename -> quiz/round/question rows for every question with media.
 * @returns {Promise<Map<string, object[]>>}
 */
const referenceFingerprint = (row) =>
  [
    row.quizId ?? 'bank',
    row.roundId ?? 'noround',
    row.questionOrder,
    String(row.questionPreview || '').trim(),
  ].join('|');

const buildReferencesByFilename = async () => {
  const questions = await Question.findAll({
    where: {
      mediaUrl: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
    },
    attributes: ['id', 'text', 'mediaUrl', 'mediaType', 'order', 'roundId'],
    include: [
      {
        model: Round,
        as: 'round',
        required: false,
        attributes: ['id', 'name', 'order', 'quizId'],
        include: [{ model: Quiz, as: 'quiz', required: false, attributes: ['id', 'title'] }],
      },
    ],
  });

  /** @type {Map<string, object[]>} */
  const byFilename = new Map();
  for (const q of questions) {
    const fn = filenameFromMediaUrl(q.mediaUrl);
    if (!fn) continue;
    const row = {
      questionId: q.id,
      questionOrder: q.order,
      questionPreview: String(q.text || '').slice(0, 160),
      quizId: q.round?.quiz?.id ?? null,
      quizTitle: q.round?.quiz?.title ?? null,
      roundId: q.round?.id ?? null,
      roundName: q.round?.name ?? null,
      roundOrder: q.round?.order ?? null,
    };
    if (!byFilename.has(fn)) byFilename.set(fn, []);
    const list = byFilename.get(fn);
    const fp = referenceFingerprint(row);
    if (list.some((r) => r.questionId === row.questionId)) continue;
    if (list.some((r) => referenceFingerprint(r) === fp)) continue;
    list.push(row);
  }
  return byFilename;
};

const mapDiskFile = (file, byFilename) => ({
  filename: file.filename,
  url: file.url,
  mediaType: String(file.mediaType || path.extname(file.filename).slice(1)).toLowerCase(),
  size: file.size,
  createdAt: file.createdAt,
  references: byFilename.get(file.filename) || [],
});

/**
 * MP3/MP4 and other (e.g. image) files on disk with quiz/round/question usage.
 * Each file's `references` may include multiple rows when the same upload URL is
 * attached to more than one question (e.g. reused across quizzes) — that is expected.
 * @returns {{ music: object[], images: object[] }}
 */
const listMediaLibrary = async () => {
  const allFiles = (await mediaService.listFiles()).filter((f) => f.filename !== '.gitkeep');
  const byFilename = await buildReferencesByFilename();

  const musicFiles = allFiles.filter(isAudioVideoFile);
  const imageFiles = allFiles.filter((f) => !isAudioVideoFile(f));

  return {
    music: musicFiles.map((file) => mapDiskFile(file, byFilename)),
    images: imageFiles.map((file) => mapDiskFile(file, byFilename)),
  };
};

/**
 * Clear mediaUrl/mediaType on every question that points at this upload filename, then delete the file.
 * @param {string} filename
 * @returns {{ deleted: boolean, detachedQuestionCount: number }}
 */
const detachQuestionsAndDeleteFile = async (filename) => {
  const rows = await Question.findAll({
    attributes: ['id', 'mediaUrl'],
    where: { mediaUrl: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
  });
  const ids = rows
    .filter((r) => filenameFromMediaUrl(r.mediaUrl) === filename)
    .map((r) => r.id);

  let detachedQuestionCount = 0;
  if (ids.length) {
    const [n] = await Question.update(
      { mediaUrl: null, mediaType: null },
      { where: { id: { [Op.in]: ids } } },
    );
    detachedQuestionCount = Number(n) || 0;
  }

  const deleted = await mediaService.deleteFile(filename);
  return { deleted, detachedQuestionCount };
};

module.exports = {
  filenameFromMediaUrl,
  listMediaLibrary,
  detachQuestionsAndDeleteFile,
};
