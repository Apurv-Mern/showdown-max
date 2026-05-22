module.exports = {
  apps: [
    {
      name: 'showdown-server',
      cwd: './server',
      script: 'dist/src/index.js',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      max_memory_restart: '600M',
      watch: false,
      autorestart: true,
    },
    {
      name: 'showdown-client',
      cwd: './client',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 5003',
      node_args: '--max-old-space-size=768',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
        NODE_OPTIONS: '--max-old-space-size=768',
      },
      max_memory_restart: '900M',
      watch: false,
      autorestart: true,
    },
  ],
};
