const router = require('express').Router();
const Post = require('../models/Post');
const verifyToken = require('../verifyToken');
const { postValidation, commentValidation } = require('../validations/validation');

// helper to ensure post status is up to date
const updatePostStatusAndSave = async (post) => {
  post.updateStatus();
  return await post.save();
};

// ---------- authorised users post a message ----------
router.post('/', verifyToken, async (req, res) => {
  const { error } = postValidation(req.body);
  if (error) return res.status(400).send({ message: error.details[0].message });

  const { title, topics, body, expiresInMinutes } = req.body;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60 * 1000);

  const post = new Post({
    title,
    topics,
    body,
    createdAt: now,
    expiresAt,
    status: 'Live',
    ownerId: req.user._id,
    ownerName: req.user.username
  });

  try {
    const savedPost = await post.save();
    res.send(savedPost);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// ---------- registered users browse messages per topic ----------
router.get('/', verifyToken, async (req, res) => {
  try {
    const topic = req.query.topic;
    const status = req.query.status;

    const filter = {};
    if (topic) {
      filter.topics = topic;
    }

    const posts = await Post.find(filter).sort({ createdAt: -1 });

    // update status dynamically based on expiry
    const now = new Date();
    const mapped = posts.map((p) => {
      if (p.expiresAt <= now && p.status !== 'Expired') {
        p.status = 'Expired';
      } else if (p.expiresAt > now && p.status !== 'Live') {
        p.status = 'Live';
      }
      return p;
    });

    // optionally filter by status AFTER status update
    const filtered =
      status && (status === 'Live' || status === 'Expired')
        ? mapped.filter((p) => p.status === status)
        : mapped;

    res.send(filtered);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// get single post by id (also authenticated)
router.get('/:postId', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).send({ message: 'Post not found' });

    post.updateStatus();
    await post.save();

    res.send(post);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// check if post is still live
const ensurePostLive = (post) => {
  const now = new Date();
  if (post.expiresAt <= now) {
    post.status = 'Expired';
    return false;
  }
  post.status = 'Live';
  return true;
};

// ---------- like a post ----------
router.post('/:postId/like', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).send({ message: 'Post not found' });

    const isLive = ensurePostLive(post);
    if (!isLive) {
      await post.save();
      return res
        .status(400)
        .send({ message: 'Post has expired. No further likes/dislikes/comments allowed.' });
    }

    if (post.ownerId.toString() === req.user._id) {
      return res.status(400).send({ message: 'Post owners cannot like their own posts.' });
    }


    const now = new Date();
    const timeLeftMs = post.expiresAt.getTime() - now.getTime();

    post.interactions.push({
      userId: req.user._id,
      username: req.user.username,
      type: 'like',
      timeLeftBeforeExpirationMs: timeLeftMs,
      createdAt: now
    });

    const savedPost = await post.save();
    res.send(savedPost);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// ---------- dislike a post ----------
router.post('/:postId/dislike', verifyToken, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).send({ message: 'Post not found' });

    const isLive = ensurePostLive(post);
    if (!isLive) {
      await post.save();
      return res
        .status(400)
        .send({ message: 'Post has expired. No further likes/dislikes/comments allowed.' });
    }

    if (post.ownerId.toString() === req.user._id) {
      return res.status(400).send({ message: 'Post owners cannot dislike their own posts.' });
    }

    const now = new Date();
    const timeLeftMs = post.expiresAt.getTime() - now.getTime();

    post.interactions.push({
      userId: req.user._id,
      username: req.user.username,
      type: 'dislike',
      timeLeftBeforeExpirationMs: timeLeftMs,
      createdAt: now
    });

    const savedPost = await post.save();
    res.send(savedPost);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// ---------- comment on a post ----------
router.post('/:postId/comment', verifyToken, async (req, res) => {
  const { error } = commentValidation(req.body);
  if (error) return res.status(400).send({ message: error.details[0].message });

  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).send({ message: 'Post not found' });

    const isLive = ensurePostLive(post);
    if (!isLive) {
      await post.save();
      return res
        .status(400)
        .send({ message: 'Post has expired. No further likes/dislikes/comments allowed.' });
    }

    const now = new Date();
    const timeLeftMs = post.expiresAt.getTime() - now.getTime();

    post.interactions.push({
      userId: req.user._id,
      username: req.user.username,
      type: 'comment',
      commentText: req.body.text,
      timeLeftBeforeExpirationMs: timeLeftMs,
      createdAt: now
    });

    const savedPost = await post.save();
    res.send(savedPost);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// ---------- most active post per topic (highest likes + dislikes) ----------
router.get('/topic/:topic/most-active', verifyToken, async (req, res) => {
  try {
    const topic = req.params.topic;
    const validTopics = ['Politics', 'Health', 'Sport', 'Tech'];
    if (!validTopics.includes(topic)) {
      return res.status(400).send({ message: 'Invalid topic' });
    }

    const posts = await Post.find({ topics: topic });

    if (posts.length === 0) {
      return res.status(404).send({ message: 'No posts found for this topic' });
    }

    // update statuses and compute activity score
    const now = new Date();
    let mostActivePost = null;
    let bestScore = -1;

    posts.forEach((p) => {
      if (p.expiresAt <= now && p.status !== 'Expired') {
        p.status = 'Expired';
      } else if (p.expiresAt > now && p.status !== 'Live') {
        p.status = 'Live';
      }

      const likes = p.interactions.filter((i) => i.type === 'like').length;
      const dislikes = p.interactions.filter((i) => i.type === 'dislike').length;
      const score = likes + dislikes;

      if (score > bestScore) {
        bestScore = score;
        mostActivePost = p;
      }
    });

    if (!mostActivePost) {
      return res.status(404).send({ message: 'No active posts found for this topic' });
    }

    await mostActivePost.save();
    res.send({ post: mostActivePost, activityScore: bestScore });
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// ---------- history data of expired posts per topic ----------
router.get('/topic/:topic/expired', verifyToken, async (req, res) => {
  try {
    const topic = req.params.topic;
    const validTopics = ['Politics', 'Health', 'Sport', 'Tech'];
    if (!validTopics.includes(topic)) {
      return res.status(400).send({ message: 'Invalid topic' });
    }

    const now = new Date();

    const posts = await Post.find({
      topics: topic,
      expiresAt: { $lte: now }
    }).sort({ expiresAt: -1 });

    // mark them as expired if not already
    posts.forEach((p) => {
      if (p.status !== 'Expired') {
        p.status = 'Expired';
      }
    });

    // save updates
    await Promise.all(posts.map((p) => p.save()));

    res.send(posts);
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

module.exports = router;
