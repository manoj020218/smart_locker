module.exports = {
  apps: [
    {
      name: "smart-locker-api",
      script: "dist/server.js",
      cwd: "/root/projects/smart_locker/VPS/api",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "300M",
      restart_delay: 3000,
      autorestart: true,
      env_production: {
        NODE_ENV: "production",
        PORT: 8080
      },
      error_file: "/root/.pm2/logs/smart-locker-api-error.log",
      out_file: "/root/.pm2/logs/smart-locker-api-out.log",
      merge_logs: true
    }
  ]
};
