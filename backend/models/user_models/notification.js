const { DataTypes } = require("sequelize");

module.exports = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: "userId"
    },
    groupId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "groupId"
    },
    groupName: {
        type: DataTypes.STRING,
        allowNull: true,
        field: "groupName"
    },
    actorUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: "actorUserId"
    },
    kind: {
        type: DataTypes.STRING(32),
        allowNull: false
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    targetTab: {
        type: DataTypes.STRING(32),
        allowNull: false,
        field: "targetTab"
    },
    readAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "readAt"
    }
};
