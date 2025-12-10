const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let app;
let mongoServer;

// models
const Post = require('../models/Post');

jest.setTimeout(60000);

describe('Mingle API end-to-end (TC1–TC20)', () => {
  // shared state across tests
  const users = {
    Olga: { email: 'olga@example.com', password: 'Password123!', token: null },
    Nick: { email: 'nick@example.com', password: 'Password123!', token: null },
    Mary: { email: 'mary@example.com', password: 'Password123!', token: null },
    Nestor: { email: 'nestor@example.com', password: 'Password123!', token: null }
  };

  const posts = {
    olgaTechPostId: null,
    nickTechPostId: null,
    maryTechPostId: null,
    nestorHealthPostId: null
  };

  // helpers
  const registerUser = async (username, email, password) => {
    const res = await request(app)
      .post('/api/user/register')
      .send({ username, email, password });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('userId');
    expect(res.body.username).toBe(username);
    expect(res.body.email).toBe(email);
  };

  const loginUser = async (name) => {
    const res = await request(app)
      .post('/api/user/login')
      .send({ email: users[name].email, password: users[name].password });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('auth-token');
    users[name].token = res.body['auth-token'];
  };

  const countInteractions = (post, type) =>
    post.interactions.filter((i) => i.type === type).length;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();

    process.env.MONGO_URI = uri;
    process.env.TOKEN_SECRET = 'test-secret-key';
    process.env.PORT = 0;

    app = require('../index');

    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
  });

  // ------------------------------------------------------------------
  test('TC 1: Olga, Nick, Mary, and Nestor register and are ready to access the Mingle API.', async () => {
    await registerUser('Olga', users.Olga.email, users.Olga.password);
    await registerUser('Nick', users.Nick.email, users.Nick.password);
    await registerUser('Mary', users.Mary.email, users.Mary.password);
    await registerUser('Nestor', users.Nestor.email, users.Nestor.password);
  });

  // ------------------------------------------------------------------
  test('TC 2: Olga, Nick, Mary, and Nestor use the authorisation service to login and get their tokens.', async () => {
    await loginUser('Olga');
    await loginUser('Nick');
    await loginUser('Mary');
    await loginUser('Nestor');

    expect(users.Olga.token).toBeTruthy();
    expect(users.Nick.token).toBeTruthy();
    expect(users.Mary.token).toBeTruthy();
    expect(users.Nestor.token).toBeTruthy();
  });

  // ------------------------------------------------------------------
  test('TC 3: Olga makes a call to the API without using her token. This call should be unsuccessful.', async () => {
    const res = await request(app).get('/api/posts?topic=Tech');
    expect(res.statusCode).toBe(401);
  });

  // ------------------------------------------------------------------
  test('TC 4: Olga posts a Tech message with expiration; after expiry it accepts no more interactions.', async () => {
    // Olga creates Tech post
    let res = await request(app)
      .post('/api/posts')
      .set('auth-token', users.Olga.token)
      .send({
        title: 'Olga Tech Post',
        topics: ['Tech'],
        body: "Olga's message about tech.",
        expiresInMinutes: 10
      });

    expect(res.statusCode).toBe(200);
    posts.olgaTechPostId = res.body._id;

    // force expire Olga's post directly in DB
    await Post.findByIdAndUpdate(posts.olgaTechPostId, {
      expiresAt: new Date(Date.now() - 60 * 1000),
      status: 'Expired'
    });

    //try to like expired post
    res = await request(app)
      .post(`/api/posts/${posts.olgaTechPostId}/like`)
      .set('auth-token', users.Olga.token);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  // ------------------------------------------------------------------
  test('TC 5: Nick posts a message in the Tech topic with an expiration time using his token.', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('auth-token', users.Nick.token)
      .send({
        title: 'Nick Tech Post',
        topics: ['Tech'],
        body: "Nick's message about tech.",
        expiresInMinutes: 10
      });

    expect(res.statusCode).toBe(200);
    posts.nickTechPostId = res.body._id;
  });

  // ------------------------------------------------------------------
  test('TC 6: Mary posts a message in the Tech topic with an expiration time using her token.', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('auth-token', users.Mary.token)
      .send({
        title: 'Mary Tech Post',
        topics: ['Tech'],
        body: "Mary's message about tech.",
        expiresInMinutes: 10
      });

    expect(res.statusCode).toBe(200);
    posts.maryTechPostId = res.body._id;
  });

  // ------------------------------------------------------------------
  test('TC 7: Nick and Olga browse Tech posts; three posts should be available with zero likes, zero dislikes and no comments.', async () => {
    const checkTechPostsZeroInteractions = async (token) => {
      const r = await request(app)
        .get('/api/posts?topic=Tech')
        .set('auth-token', token);

      expect(r.statusCode).toBe(200);
      expect(r.body.length).toBe(3); // Olga, Nick, Mary posts

      r.body.forEach((post) => {
        const likes = countInteractions(post, 'like');
        const dislikes = countInteractions(post, 'dislike');
        const comments = countInteractions(post, 'comment');
        expect(likes).toBe(0);
        expect(dislikes).toBe(0);
        expect(comments).toBe(0);
      });
    };

    await checkTechPostsZeroInteractions(users.Nick.token);
    await checkTechPostsZeroInteractions(users.Olga.token);
  });

  // ------------------------------------------------------------------
  test('TC 8: Nick and Olga "like" Mary’s post on the Tech topic.', async () => {
    let res = await request(app)
      .post(`/api/posts/${posts.maryTechPostId}/like`)
      .set('auth-token', users.Nick.token);
    expect(res.statusCode).toBe(200);

    res = await request(app)
      .post(`/api/posts/${posts.maryTechPostId}/like`)
      .set('auth-token', users.Olga.token);
    expect(res.statusCode).toBe(200);
  });

  // ------------------------------------------------------------------
  test('TC 9: Nestor "likes" Nick’s post and "dislikes" Mary’s post on the Tech topic.', async () => {
    let res = await request(app)
      .post(`/api/posts/${posts.nickTechPostId}/like`)
      .set('auth-token', users.Nestor.token);
    expect(res.statusCode).toBe(200);

    res = await request(app)
      .post(`/api/posts/${posts.maryTechPostId}/dislike`)
      .set('auth-token', users.Nestor.token);
    expect(res.statusCode).toBe(200);
  });

  // ------------------------------------------------------------------
  test('TC 10: Nick browses Tech posts and sees correct likes/dislikes (Mary: 2 likes & 1 dislike, Nick: 1 like).', async () => {
    const res = await request(app)
      .get('/api/posts?topic=Tech')
      .set('auth-token', users.Nick.token);

    expect(res.statusCode).toBe(200);

    const nickViewPosts = res.body;
    const maryPost = nickViewPosts.find((p) => p._id === posts.maryTechPostId);
    const nickPost = nickViewPosts.find((p) => p._id === posts.nickTechPostId);

    expect(countInteractions(maryPost, 'like')).toBe(2);
    expect(countInteractions(maryPost, 'dislike')).toBe(1);
    expect(countInteractions(maryPost, 'comment')).toBe(0);

    expect(countInteractions(nickPost, 'like')).toBe(1);
    expect(countInteractions(nickPost, 'dislike')).toBe(0);
    expect(countInteractions(nickPost, 'comment')).toBe(0);
  });

  // ------------------------------------------------------------------
  test('TC 11: Mary tries to like her own Tech post. This call should be unsuccessful.', async () => {
    const res = await request(app)
      .post(`/api/posts/${posts.maryTechPostId}/like`)
      .set('auth-token', users.Mary.token);

    // "no self-like" rule
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/own/i);
  });

  // ------------------------------------------------------------------
  test('TC 12: Nick and Olga comment on Mary’s Tech post in a round-robin fashion.', async () => {
    const commentOnMary = async (token, text) => {
      const r = await request(app)
        .post(`/api/posts/${posts.maryTechPostId}/comment`)
        .set('auth-token', token)
        .send({ text });
      expect(r.statusCode).toBe(200);
    };

    await commentOnMary(users.Nick.token, 'Nice post, Mary! - Nick 1');
    await commentOnMary(users.Olga.token, 'Great insights, Mary! - Olga 1');
    await commentOnMary(users.Nick.token, 'I agree with this. - Nick 2');
    await commentOnMary(users.Olga.token, 'Very informative. - Olga 2');
  });

  // ------------------------------------------------------------------
  test('TC 13: Nick browses Tech posts and sees likes, dislikes, and comments on each post.', async () => {
    const res = await request(app)
      .get('/api/posts?topic=Tech')
      .set('auth-token', users.Nick.token);

    expect(res.statusCode).toBe(200);

    const postsAfterComments = res.body;
    const maryAfterComments = postsAfterComments.find((p) => p._id === posts.maryTechPostId);

    expect(countInteractions(maryAfterComments, 'like')).toBe(2);
    expect(countInteractions(maryAfterComments, 'dislike')).toBe(1);
    expect(countInteractions(maryAfterComments, 'comment')).toBeGreaterThanOrEqual(4);
  });

  // ------------------------------------------------------------------
  test('TC 14: Nestor posts a message in the Health topic with an expiration time using his token.', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('auth-token', users.Nestor.token)
      .send({
        title: 'Nestor Health Post',
        topics: ['Health'],
        body: "Nestor's message about health.",
        expiresInMinutes: 10
      });

    expect(res.statusCode).toBe(200);
    posts.nestorHealthPostId = res.body._id;
  });

  // ------------------------------------------------------------------
  test('TC 15: Mary browses all available posts on the Health topic; she sees only Nestor’s post.', async () => {
    const res = await request(app)
      .get('/api/posts?topic=Health')
      .set('auth-token', users.Mary.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0]._id).toBe(posts.nestorHealthPostId);
  });

  // ------------------------------------------------------------------
  test('TC 16: Mary posts a comment on Nestor’s message on the Health topic.', async () => {
    const res = await request(app)
      .post(`/api/posts/${posts.nestorHealthPostId}/comment`)
      .set('auth-token', users.Mary.token)
      .send({ text: 'Take care, Nestor! - Mary' });

    expect(res.statusCode).toBe(200);
  });

  // ------------------------------------------------------------------
  test('TC 17: Mary dislikes Nestor’s Health post after it expires. This should fail.', async () => {
    // force expire Nestor's Health post
    await Post.findByIdAndUpdate(posts.nestorHealthPostId, {
      expiresAt: new Date(Date.now() - 60 * 1000),
      status: 'Expired'
    });

    const res = await request(app)
      .post(`/api/posts/${posts.nestorHealthPostId}/dislike`)
      .set('auth-token', users.Mary.token);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  // ------------------------------------------------------------------
  test('TC 18: Nestor browses all messages on the Health topic. There is one post (his) with one comment (Mary’s).', async () => {
    const res = await request(app)
      .get('/api/posts?topic=Health')
      .set('auth-token', users.Nestor.token);

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);

    const nestorHealthPost = res.body[0];
    expect(nestorHealthPost._id).toBe(posts.nestorHealthPostId);
    expect(countInteractions(nestorHealthPost, 'comment')).toBe(1);
  });

  // ------------------------------------------------------------------
  test('TC 19: Nick browses all the expired messages on the Sports topic. These should be empty.', async () => {
    const res = await request(app)
      .get('/api/posts/topic/Sport/expired')
      .set('auth-token', users.Nick.token);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  // ------------------------------------------------------------------
  test('TC 20: Nestor queries for the active Tech post with highest interest. This should be Mary’s post.', async () => {
    const res = await request(app)
      .get('/api/posts/topic/Tech/most-active')
      .set('auth-token', users.Nestor.token);

    expect(res.statusCode).toBe(200);

    const mostActive = res.body.post;
    expect(mostActive._id).toBe(posts.maryTechPostId);
  });
});
