#!/usr/bin/env node
/**
 * Showdown Trivia — Socket.io load test
 *
 * Examples:
 *   node tools/load-test/run.js --setup --bots 150
 *   node tools/load-test/run.js --pin 123456 --bots 150
 *   node tools/load-test/run.js --pin 123456 --bots 150 --no-host-bot
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { createPlayerBot, sleep } = require('./playerBot');
const { createHostBot } = require('./hostBot');
const { setupLoadTestSession } = require('./setupSession');

const parseArgs = (argv) => {
  const opts = {
    url: process.env.LOAD_TEST_URL || process.env.SOCKET_URL || 'http://localhost:5001',
    pin: process.env.LOAD_TEST_PIN || '',
    bots: Number(process.env.LOAD_TEST_BOTS) || 150,
    joinDelayMs: Number(process.env.LOAD_TEST_JOIN_DELAY_MS) || 30,
    setup: false,
    hostBot: true,
    quizId: null,
    durationSec: 0,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--setup') opts.setup = true;
    else if (arg === '--no-host-bot') opts.hostBot = false;
    else if (arg === '--pin') opts.pin = String(argv[++i] || '');
    else if (arg === '--bots') opts.bots = Number(argv[++i]);
    else if (arg === '--url') opts.url = String(argv[++i] || opts.url);
    else if (arg === '--join-delay') opts.joinDelayMs = Number(argv[++i]);
    else if (arg === '--quiz-id') opts.quizId = Number(argv[++i]);
    else if (arg === '--duration') opts.durationSec = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }

  return opts;
};

const printHelp = () => {
  console.log(`
Showdown Trivia load test — ${150} concurrent player bots (configurable)

Usage:
  node tools/load-test/run.js [options]

Options:
  --setup              Create session + assign host via admin API
  --pin PIN            6-digit session PIN (required unless --setup)
  --bots N             Number of player bots (default: 150)
  --url URL            Server URL (default: http://localhost:5001)
  --join-delay MS      Delay between bot joins (default: 30)
  --quiz-id N          Quiz ID when using --setup
  --no-host-bot        Do not auto-drive the game (use real host dashboard)
  --duration SEC       Stop after SEC seconds and print stats
  --help               Show this help

Env:
  LOAD_TEST_URL, LOAD_TEST_PIN, LOAD_TEST_BOTS, LOAD_TEST_JOIN_DELAY_MS
  ADMIN_EMAIL, ADMIN_PASSWORD, HOST_EMAIL, HOST_PASSWORD (for --setup)

Prerequisites:
  - Server running with Redis available
  - For --setup: at least one quiz in the database
  - Session maxTeams >= bot count
`);
};

const printStats = (stats, bots, startedAt) => {
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const joinedBots = bots.filter((b) => b.joined).length;
  const failedBots = bots.filter((b) => b.errors.length > 0).length;

  console.log('\n========== Load test stats ==========');
  console.log(`Elapsed:          ${elapsed}s`);
  console.log(`PIN:              ${stats.pin}`);
  console.log(`Bots requested:   ${stats.botsRequested}`);
  console.log(`Joined:           ${joinedBots} (failures: ${stats.joinFailed})`);
  console.log(`Bots w/ errors:   ${failedBots}`);
  console.log(`Answers sent:     ${stats.answersSubmitted}`);
  console.log(`Wagers sent:      ${stats.wagersSubmitted}`);
  if (stats.hostBot) {
    console.log(`Host starts:      ${stats.hostStarts}`);
    console.log(`Host next Q:      ${stats.hostNextQuestions}`);
    console.log(`Host reveals:     ${stats.hostReveals}`);
    console.log(`Host adv rounds:  ${stats.hostAdvanceRounds}`);
    console.log(`Game ended:       ${stats.gameEnded ? 'yes' : 'no'}`);
  }
  console.log('=====================================\n');
};

const main = async () => {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }

  const stats = {
    pin: opts.pin,
    botsRequested: opts.bots,
    joined: 0,
    joinFailed: 0,
    answersSubmitted: 0,
    wagersSubmitted: 0,
    hostBot: opts.hostBot,
    hostStarts: 0,
    hostNextQuestions: 0,
    hostReveals: 0,
    hostAdvanceRounds: 0,
    hostTimerStarts: 0,
    teamsJoined: 0,
    gameEnded: false,
  };

  if (opts.bots > 50 && /localhost|127\.0\.0\.1/.test(opts.url)) {
    console.warn(
      `\n⚠️  Warning: ${opts.bots} bots on local dev can freeze the server (event loop + logging).\n` +
        '   Use --bots 30 for local testing, or run 150 bots against your production/staging server.\n',
    );
  }

  console.log(`Load test → ${opts.url} | bots=${opts.bots} | hostBot=${opts.hostBot}`);

  if (opts.setup) {
    console.log('Setting up session via admin API...');
    const created = await setupLoadTestSession({
      baseUrl: opts.url,
      maxTeams: Math.max(opts.bots, 150),
      quizId: opts.quizId,
    });
    opts.pin = created.pin;
    stats.pin = created.pin;
    console.log(`Session ready: PIN=${created.pin} quizId=${created.quizId} maxTeams=${created.maxTeams}`);
  }

  if (!/^\d{6}$/.test(String(opts.pin))) {
    console.error('Error: provide a 6-digit PIN with --pin or use --setup');
    printHelp();
    process.exit(1);
  }
  stats.pin = opts.pin;

  const healthRes = await fetch(`${opts.url}/health`).catch(() => null);
  if (healthRes?.ok) {
    const health = await healthRes.json();
    const redis = health?.data?.redis;
    if (redis && !redis.ok) {
      console.warn('Warning: Redis is not healthy — use Redis for 150+ bots');
    }
  } else {
    console.warn(`Warning: could not reach ${opts.url}/health`);
  }

  let host = null;
  if (opts.hostBot) {
    console.log('Starting host bot...');
    host = createHostBot({
      url: opts.url,
      pin: opts.pin,
      expectedTeams: opts.bots,
      stats,
    });
    await host.connect();
  } else {
    console.log('Host bot disabled — use the host dashboard to start/advance the game');
  }

  const bots = [];
  console.log(`Spawning ${opts.bots} player bots (join delay ${opts.joinDelayMs}ms)...`);

  for (let i = 0; i < opts.bots; i += 1) {
    const teamName = `LoadBot${String(i + 1).padStart(3, '0')}`;
    const bot = createPlayerBot({
      url: opts.url,
      pin: opts.pin,
      teamName,
      index: i,
      stats,
    });
    bots.push(bot);

    setTimeout(() => {
      bot.connectAndJoin().catch((err) => {
        bot.errors.push(err.message);
        stats.joinFailed += 1;
        if (stats.joinFailed <= 5) {
          console.error(`[${teamName}] join failed: ${err.message}`);
        }
      });
    }, i * opts.joinDelayMs);
  }

  const startedAt = Date.now();
  let stopTimer = null;

  const shutdown = () => {
    if (stopTimer) clearTimeout(stopTimer);
    printStats(stats, bots, startedAt);
    host?.disconnect();
    for (const bot of bots) bot.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (opts.durationSec > 0) {
    stopTimer = setTimeout(shutdown, opts.durationSec * 1000);
  } else if (opts.hostBot) {
    // Auto-exit when game ends or after long timeout
    const poll = setInterval(() => {
      if (stats.gameEnded) {
        clearInterval(poll);
        setTimeout(shutdown, 3000);
      }
    }, 2000);
    stopTimer = setTimeout(() => {
      clearInterval(poll);
      console.log('Max runtime reached (30 min)');
      shutdown();
    }, 30 * 60 * 1000);
  } else {
    console.log('Running until Ctrl+C...');
  }

  // Progress log every 10s
  setInterval(() => {
    const joined = bots.filter((b) => b.joined).length;
    console.log(
      `[${((Date.now() - startedAt) / 1000).toFixed(0)}s] joined=${joined}/${opts.bots} answers=${stats.answersSubmitted} wagers=${stats.wagersSubmitted}`,
    );
  }, 10000);

  await sleep(opts.bots * opts.joinDelayMs + 5000);
};

main().catch((err) => {
  console.error('Load test failed:', err.message);
  process.exit(1);
});
