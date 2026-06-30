require('dotenv').config();
const http = require('http');
const bcrypt = require("bcrypt");
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { initRedis } = require('./src/config/redis');
const { initMailer } = require('./src/config/mailer');
const logger = require('./src/utils/logger');
const User = require('./src/models/User');

const PORT = process.env.PORT || 5000;

// Initialize Server
const server = http.createServer(app);

const startServer = async () => {
  // Connect to DB
  await connectDB();

  // Initialize caching and mailer
  await initRedis();
  initMailer();


  // Admin default email and password
  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;

  const existing = await User.findOne({ email: adminEmail });

  if (!existing) {
    await User.create({
      name: 'System Admin',
      email: adminEmail,
      // Let the User model hash the raw password once in its pre-save hook.
      passwordHash: adminPassword,
      role: 'admin',
      isVerified: true,
    });

    logger.info('Default admin created');
  } else {
    let changed = false;

    if (existing.role !== 'admin') {
      existing.role = 'admin';
      changed = true;
    }

    if (!existing.isVerified) {
      existing.isVerified = true;
      changed = true;
    }

    const passwordMatches = await bcrypt.compare(adminPassword, existing.passwordHash);
    if (!passwordMatches || process.env.DEFAULT_ADMIN_FORCE_RESET === 'true') {
      // Store the raw password so the model hook hashes it exactly once.
      existing.passwordHash = adminPassword;
      changed = true;
    }

    if (changed) {
      await existing.save();
      logger.info('Admin updated');
    }
  }

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
