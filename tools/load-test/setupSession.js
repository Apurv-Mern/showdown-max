const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const apiFetch = async (baseUrl, route, options = {}) => {
  const res = await fetch(`${baseUrl}${route}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error || json?.message || res.statusText;
    throw new Error(`${options.method || 'GET'} ${route} failed (${res.status}): ${message}`);
  }
  return json?.data ?? json;
};

/**
 * Creates a pending session and assigns a host so players can join.
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {number} options.maxTeams
 * @param {number} [options.quizId]
 */
const setupLoadTestSession = async ({ baseUrl, maxTeams, quizId }) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@showdown.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hostEmail = process.env.HOST_EMAIL || 'host@showdown.com';
  const hostPassword = process.env.HOST_PASSWORD || 'host123';

  const login = await apiFetch(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword, role: 'admin' },
  });

  const token = login.token;
  if (!token) throw new Error('Admin login did not return a token');

  let resolvedQuizId = quizId;
  if (!resolvedQuizId) {
    const quizzes = await apiFetch(baseUrl, '/api/quizzes?limit=1', { token });
    const first = quizzes?.quizzes?.[0] || quizzes?.[0];
    if (!first?.id) {
      throw new Error('No quizzes found. Run db:seed or create a quiz in admin first.');
    }
    resolvedQuizId = first.id;
  }

  const session = await apiFetch(baseUrl, '/api/sessions', {
    method: 'POST',
    token,
    body: { quizId: Number(resolvedQuizId), maxTeams: Number(maxTeams) },
  });

  const hosts = await apiFetch(baseUrl, '/api/hosts', { token });
  const hostList = Array.isArray(hosts) ? hosts : hosts?.hosts || [];
  let host = hostList.find((h) => h.email === hostEmail);

  if (host?.id) {
    host = await apiFetch(baseUrl, `/api/hosts/${host.id}`, {
      method: 'PATCH',
      token,
      body: { sessionId: session.id, isActive: true },
    });
  } else {
    host = await apiFetch(baseUrl, '/api/hosts', {
      method: 'POST',
      token,
      body: {
        email: hostEmail,
        password: hostPassword,
        sessionId: session.id,
      },
    });
  }

  return {
    pin: String(session.pin),
    sessionId: session.id,
    quizId: resolvedQuizId,
    maxTeams: session.maxTeams || maxTeams,
    hostEmail,
  };
};

module.exports = { setupLoadTestSession, apiFetch };
