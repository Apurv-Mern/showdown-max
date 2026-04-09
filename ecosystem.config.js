module.exports = {
  apps: [
    {
      name: 'showdown-server',
      cwd: './server',
      script: 'dist/src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
      watch: false,
      autorestart: true,
    },
    {
      name: 'showdown-client',
      cwd: './client',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
      },
      watch: false,
      autorestart: true,
    },
  ],
};
