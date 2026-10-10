const { DataTypes } = require('sequelize');

const SessionDef = {
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        foreignKey: true
    },
    token_hash: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    device_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    user_browser: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    ip_address: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    last_used_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    revoked_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}

module.exports = SessionDef;