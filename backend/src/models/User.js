const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required']
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  profilePicture: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  otp: {
    type: String,
    default: null
  },
  otpExpires: {
    type: Date,
    default: null
  },
  sessions: [
    {
      refreshToken: {
        type: String,
        required: true,
        index: true
      },
      deviceName: {
        type: String,
        default: 'Unknown Device'
      },
      platform: {
        type: String,
        default: 'Unknown Platform'
      },
      ipAddress: {
        type: String,
        default: ''
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      lastUsedAt: {
        type: Date,
        default: Date.now
      },
      expiresAt: {
        type: Date,
        required: true
      }
    }
  ],
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  otpRequestCount: {
    type: Number,
    default: 0
  },
  otpRequestWindowStart: {
    type: Date,
    default: null
  },
  isDisabled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function () {
  if (!this.isModified('passwordHash')) return;

  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
