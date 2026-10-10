const joi = require("joi");

const addExpenseSchema = joi.object({
    amount: joi.number()
        .positive()
        .required()
        .messages({
            'any.required': 'Amount is required',
            'number.positive': 'Amount should be positive'
        }),
    category: joi.string()
        .valid('Food', 'Shopping', 'Education', 'Friend', 'EMI', 'Bills', 'Others')
        .required()
        .messages({
            'any.required': 'Category is required',
            'string.valid': 'Invalid category'
        }),
    desc: joi.string()
        .max(255)
        .optional()
        .messages({
            'string.max': 'Description cannot exceed 255 characters'
        }),
    paid_to: joi.string()
        .required()
        .messages({
            'any.required': 'Paid to is required'
        })

});

module.exports = {
    addExpenseSchema
};