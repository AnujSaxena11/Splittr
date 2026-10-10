const Joi = require('joi');

const createGroupSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            'string.empty': 'Name is required',
            'string.min': 'Name must be atleast 2 characters long',
            'string.max': 'Name cannot excess 100 characters',
        }),
    description: Joi.string()
        .min(10)
        .max(300)
        .messages({
            'string.min': 'description must be atleast 10 characters long',
            'string.max': 'description cannot excess 300 characters',
        })
});

module.exports = {
    createGroupSchema
}