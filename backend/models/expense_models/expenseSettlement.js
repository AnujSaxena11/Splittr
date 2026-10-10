const {DataTypes} = require('sequelize');

const expenseSettlementDef = {
    group_id:{
        type: DataTypes.INTEGER,
        foreignKey: true
    },
    payer_id:{
        type: DataTypes.INTEGER,
        foreignKey: true,
        allowNull: false
    },
    receiver_id:{
        type: DataTypes.INTEGER,
        foreignKey: true,
        allowNull: false
    },
    amount:{
        type: DataTypes.DECIMAL(10,2),
        allowNull: false
    },
    status:{
        type: DataTypes.ENUM('pending','completed','cancelled','rejected'),
        defaultValue: 'pending'
    },
    clearedAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    confirmedAt: {
        type: DataTypes.DATE,
        allowNull: true
    }
};
module.exports = expenseSettlementDef;