const {DataTypes} = require('sequelize');

const groupDef = {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    ownerId:{
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    unique_code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    total_members: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
    status: {
        type: DataTypes.ENUM('complete', 'ongoing'),
        defaultValue: 'ongoing',
    }
};

module.exports = groupDef;