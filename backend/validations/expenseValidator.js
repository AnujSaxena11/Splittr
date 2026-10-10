const joi = require('joi');

const splitTypes = ['equal', 'custom'];

const addExpenseSchema = joi.object({
    title: joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Title is required',
            'string.min': 'Title must be at least 2 characters long',
            'string.max': 'Title cannot exceed 100 characters',
        }),
    amount: joi.number()
        .positive()
        .required()
        .messages({
            'any.required': 'Amount is required',
            'number.positive': 'Amount must be a positive number',
        }),
    splitType: joi.string()
        .valid('equal', 'custom')
        .required()
        .messages({
            'any.required': 'Split type is required',
            'any.only': `Split type must be one of ${splitTypes.join(', ')}`
        }),
    participants: joi.array()
        .items(joi.number().integer().positive())
        .unique(),
    splits: joi.array()
        .items(joi.object({
            userId: joi.number()
                .integer()
                .positive()
                .required()
                .messages({
                    'any.required': 'User ID is required',
                }),
            amount: joi.number()
                .positive()
                .required()
                .messages({
                    'any.required': 'Amount is required',
                    'number.positive': 'Amount must be a positive number',
                }),
        }))
});

const settleExpenseSchema = joi.object({
    receiverId: joi.number().integer().positive().required(),
    amount: joi.number()
        .positive()
        .precision(2)
        .required()
        .messages({
            'any.required': 'Amount is required',
            'number.positive': 'Amount must be a positive number',
        }),
});

const settlementResponseSchema = joi.object({
    accept: joi.boolean().required()
});

module.exports = {
    addExpenseSchema,
    settleExpenseSchema,
    settlementResponseSchema
}