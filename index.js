const express = require('express');
const app = express();

const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv/config');

// middleware
app.use(bodyParser.json());

const authRoute = require('./routes/auth');
const postsRoute = require('./routes/posts');

// route middlewares
app.use('/api/user', authRoute);
app.use('/api/posts', postsRoute);

// root route for basic API info
app.get('/', (req, res) => {
  res.json({
    name: 'Mingle API',
    version: '1.0.0',
    description: 'Twitter-like system for posts, likes, dislikes and comments.',
    docs: '/api/posts'
  });
});

// connect to MongoDB
console.log('Connecting to MongoDB...', process.env.MONGO_URI);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected...');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// start server
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('Server is running on port', PORT);
  });
}

module.exports = app;
