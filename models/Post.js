const mongoose = require('mongoose');

const interactionSchema = mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  username: String,
  type: {
    type: String,
    enum: ['like', 'dislike', 'comment'],
    required: true
  },
  commentText: {
    type: String // only used for comments
  },
  timeLeftBeforeExpirationMs: Number, // snapshot when interaction happened
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const postSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    topics: [
      {
        type: String,
        enum: ['Politics', 'Health', 'Sport', 'Tech'],
        required: true
      }
    ],
    body: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['Live', 'Expired'],
      default: 'Live'
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    ownerName: String,
    interactions: [interactionSchema]
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// virtual counts
postSchema.virtual('likesCount').get(function () {
  return this.interactions.filter((i) => i.type === 'like').length;
});

postSchema.virtual('dislikesCount').get(function () {
  return this.interactions.filter((i) => i.type === 'dislike').length;
});

postSchema.virtual('commentsCount').get(function () {
  return this.interactions.filter((i) => i.type === 'comment').length;
});

// auto update status based on expiry
postSchema.methods.updateStatus = function () {
  if (this.expiresAt <= new Date()) {
    this.status = 'Expired';
  } else {
    this.status = 'Live';
  }
};

module.exports = mongoose.model('Post', postSchema);
