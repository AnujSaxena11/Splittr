const Joi = require("joi");

const email = Joi.string()
        .email({minDomainSegments: 2})
        .lowercase()
        .required()
        .messages({
            'string.email': 'Enter a valid email address',
            'string.empty': 'Email is required',
        });

const password = Joi.string()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[_$@])[a-zA-Z0-9_$@]{12,72}$/)
        .required()
        .messages({
            'string.pattern.base': 'Use 12–72 characters with uppercase and lowercase letters, a number, and one of _, $ or @',
            'string.empty': 'Password is required'
        });

const cpassword = Joi.string()
        .valid(Joi.ref('password'))
        .required()
        .messages({ 'any.only': 'Passwords do not match' });

const otp = Joi.string()
    .length(6)
    .pattern(/^[0-9]{6}$/)
    .required()
    .messages({
        'string.length': 'OTP must be 6 digits',
        'string.empty': 'OTP is required',
        'string.pattern.base': 'OTP must contain only digits'
    });        

const signUpSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be atleast 2 characters long',
            'string.max': 'Name cannot excess 100 characters',
        }),
    email,
    password,
    cpassword
});

const loginSchema = Joi.object({
    email,
    password: password
});

const forgetPasswordSchema = Joi.object({
    email,
});

const verifyOTPSchema = Joi.object({
    email,
    otp,
    newPassword: password,
    cnewPassword: Joi.string()
        .valid(Joi.ref('newPassword'))
        .required()
        .messages({ 'any.only': 'Passwords do not match' })
});

module.exports = {
    signUpSchema,
    loginSchema,
    forgetPasswordSchema,
    verifyOTPSchema
}