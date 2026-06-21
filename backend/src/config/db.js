const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/expense_split';
    mongoose.set('strictQuery', false);
    
    await mongoose.connect(mongoURI);
    
    logger.info('MongoDB connected successfully to: %s', mongoURI.split('@').pop());
  } catch (error) {
    logger.error('MongoDB connection error: ', error);
    process.exit(1);
  }
};

module.exports = connectDB;
