const {DataTypes} = require('sequelize');

const expenseDataDef = {
    amount: {
        type: DataTypes.DECIMAL(10,2),
        allowNull: false
    },
    splitType: {
        type: DataTypes.ENUM('equal', 'custom'),
        allowNull: true
    },
    scope:{
        type: DataTypes.ENUM('self', 'group'),
        allowNull: false
    },
    category: {
        type: DataTypes.ENUM('Food', 'Shopping', 'Education', 'Friend', 'EMI', 'Bills', 'Others'),
        allowNull: false
    },
    desc: {
        type: DataTypes.STRING,
        allowNull: true
    },
    date: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW
    },
    // only for self
    paid_to: {
        type: DataTypes.STRING,
        allowNull: true
    },
    paidBy: {
        type: DataTypes.INTEGER,
        foreignKey: true,
        allowNull: false,
        field: 'paid_by'
    },
    groupId: {
        type: DataTypes.INTEGER,
        foreignKey: true,
        allowNull: true,
        field: 'group_id'
    },
};

module.exports = expenseDataDef;