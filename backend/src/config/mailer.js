const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

const initMailer = async () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for 587
      auth: {
        user,
        pass
      }
    });

    try {
      await transporter.verify();
      logger.info('SMTP Mailer configured successfully');
      logger.info('SMTP SERVER READY');
    } catch (error) {
      logger.error('SMTP ERROR:', error);
      transporter = null;
    }
  } else {
    logger.warn(
      'SMTP credentials missing. Mailer will run in mock mode (emails logged to console).'
    );
  }
};

const sendEmail = async ({ to, subject, text, html }) => {
  const from =
    process.env.SMTP_FROM ||
    `"SplitWise Pro" <${process.env.SMTP_USER}>`;

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html
      });

      logger.info(`EMAIL SENT: ${info.messageId}`);
      logger.info(`EMAIL RECEIVER: ${to}`);

      return info;
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  } else {
    logger.info('--- MOCK EMAIL SENT ---');
    logger.info(`To: ${to}`);
    logger.info(`Subject: ${subject}`);
    logger.info(`Body: ${text}`);
    logger.info('-----------------------');

    return {
      mock: true,
      messageId: `mock-id-${Date.now()}`
    };
  }
};

module.exports = {
  initMailer,
  sendEmail
};