const { DataTypes } = require('sequelize');

const GroupMemberDef = {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        foreignKey: true,
    },
    groupId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        foreignKey: true,
        field: 'group_id',
    },
    role: {
        type: DataTypes.ENUM('member', 'admin'),
        defaultValue: 'member'
    },
    status:{
        type: DataTypes.ENUM('pending', 'accepted'),
        defaultValue: 'pending'
    }
};

module.exports = GroupMemberDef;