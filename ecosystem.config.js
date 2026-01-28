module.exports = {
  apps: [
    {
      name: 'delight-desk',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NO_COLOR: '1',
      },
      error_file: 'logs/delight-desk-error.log',
      out_file: 'logs/delight-desk-out.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      merge_logs: true,

      kill_timeout: 5000,
      listen_timeout: 3000,
    },
  ],
};
