const Joi = require('joi');

function validate(schema, property = 'body') {
  return (req, res, next) => {
    const toValidate = req[property] || {};
    const { error, value } = schema.validate(toValidate, { abortEarly: false, convert: true, allowUnknown: false });
    if (error) {
      const details = error.details.map(d => d.message);
      return res.status(400).json({ message: details.join(', '), details });
    }
    req[property] = value;
    next();
  };
}

module.exports = validate;
