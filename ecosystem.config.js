// PM2 process manager config
// Install: npm install -g pm2
// Start:   pm2 start ecosystem.config.js
// Reload:  pm2 reload crm
// Logs:    pm2 logs crm
// Auto-start on reboot: pm2 startup && pm2 save

module.exports = {
  apps: [{
    name:             'crm',
    script:           'server.js',
    instances:        1,
    autorestart:      true,
    watch:            false,
    max_memory_restart: '256M',
    env_production: {
      NODE_ENV: 'production',
      PORT:     3456,
    },
    error_file:  'logs/err.log',
    out_file:    'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs:  true,
  }],
};
