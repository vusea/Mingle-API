const Joi = require('joi');

// register validation
const registerValidation = (data) => {
  const schema = Joi.object({
    username: Joi.string().min(3).max(256).required(),
    email: Joi.string().min(6).max(256).email().required(),
    password: Joi.string().min(6).max(1024).required()
  });

  return schema.validate(data);
};

// login validation
const loginValidation = (data) => {
  const schema = Joi.object({
    email: Joi.string().min(6).max(256).email().required(),
    password: Joi.string().min(6).max(1024).required()
  });

  return schema.validate(data);
};

// post creation validation
const postValidation = (data) => {
  const schema = Joi.object({
    title: Joi.string().min(3).max(256).required(),
    topics: Joi.array()
      .items(Joi.string().valid('Politics', 'Health', 'Sport', 'Tech'))
      .min(1)
      .required(),
    body: Joi.string().min(1).required(),
    // how long the post will be live (in minutes)
    expiresInMinutes: Joi.number().integer().min(1).max(60 * 24 * 30).required()
  });

  return schema.validate(data);
};

// comment validation
const commentValidation = (data) => {
  const schema = Joi.object({
    text: Joi.string().min(1).max(1024).required()
  });

  return schema.validate(data);
};

module.exports.registerValidation = registerValidation;
module.exports.loginValidation = loginValidation;
module.exports.postValidation = postValidation;
module.exports.commentValidation = commentValidation;
