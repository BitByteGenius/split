const fs = require('fs');
const imagekit = require('../config/imagekit');
const logger = require('../utils/logger');

const isImageKitConfigured = process.env.IMAGEKIT_PUBLIC_KEY && process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT;

const uploadFile = async (file) => {
  if (!file) return null;

  try {
    if (isImageKitConfigured) {
      logger.info('Uploading file to ImageKit: %s', file.path);
      const fileData = fs.readFileSync(file.path);
      
      const result = await imagekit.upload({
        file : fileData, // required
        fileName : file.filename, // required
        folder: '/expense_split'
      });
      
      // Clean up the local file after uploading
      fs.unlink(file.path, (err) => {
        if (err) logger.error('Failed to delete temp local file: ', err);
      });

      return result.url;
    } else {
      // Local fallback: Return local server path
      const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
      const filename = file.filename;
      return `${serverUrl}/uploads/${filename}`;
    }
  } catch (error) {
    logger.error('File upload error: ', error);
    // Cleanup local file if it exists
    if (fs.existsSync(file.path)) {
      fs.unlink(file.path, (err) => {
        if (err) logger.error('Failed to cleanup temp file: ', err);
      });
    }
    throw error;
  }
};

module.exports = {
  uploadFile
};
