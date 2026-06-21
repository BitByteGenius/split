require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initRedis } = require('./src/config/redis');
const { initMailer } = require('./src/config/mailer');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

// Initialize Server
const server = http.createServer(app);

const startServer = async () => {
  // Connect to DB
  await connectDB();

  // Initialize caching and mailer
  await initRedis();
  initMailer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use. Stop the existing server or use a different PORT.`);
      process.exit(1);
    }
    logger.error('Server error:', err);
    process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(
      `Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`
    );
  });
};

startServer().catch((error) => {
  logger.error('Failed to start server: ', error);
  process.exit(1);
});
