const router = require('express').Router();
const bcryptjs = require('bcryptjs');
const jsonwebtoken = require('jsonwebtoken');

const User = require('../models/User');
const { registerValidation, loginValidation } = require('../validations/validation');

// register
router.post('/register', async (req, res) => {
  // validate input
  const { error } = registerValidation(req.body);
  if (error) return res.status(400).send({ message: error.details[0].message });

  // check if user already exists
  const emailExists = await User.findOne({ email: req.body.email });
  if (emailExists) return res.status(400).send({ message: 'Email already registered.' });

  // hash password
  const salt = await bcryptjs.genSalt(10);
  const hashedPassword = await bcryptjs.hash(req.body.password, salt);

  // create user
  const user = new User({
    username: req.body.username,
    email: req.body.email,
    password: hashedPassword
  });

  try {
    const savedUser = await user.save();
    res.send({ userId: savedUser._id, username: savedUser.username, email: savedUser.email });
  } catch (err) {
    res.status(400).send({ message: err });
  }
});

// login
router.post('/login', async (req, res) => {
  // validate input
  const { error } = loginValidation(req.body);
  if (error) return res.status(400).send({ message: error.details[0].message });

  // check if email exists
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(400).send({ message: 'Email or password is wrong.' });

  // check password
  const validPass = await bcryptjs.compare(req.body.password, user.password);
  if (!validPass) return res.status(400).send({ message: 'Email or password is wrong.' });

  // create and assign JWT (OAuth2-style Bearer token)
  const token = jsonwebtoken.sign(
    { _id: user._id, username: user.username },
    process.env.TOKEN_SECRET
  );

  res.header('auth-token', token).send({ 'auth-token': token });
});

module.exports = router;
