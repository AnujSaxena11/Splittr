const {DataTypes} = require('sequelize');

const expenseMemberDef = {
    userId:{
        type: DataTypes.INTEGER,
        foreignKey: true,
        allowNull: false
    },
    expenseId:{
        type: DataTypes.INTEGER,
        foreignKey: true,
        allowNull: false,
        field: "expense_id"
    },
    shareAmount: {
        type: DataTypes.DECIMAL(10,2),
        defaultValue: 0.00
    }
};
module.exports = expenseMemberDef;