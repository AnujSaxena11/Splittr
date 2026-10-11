const { Sequelize } = require("sequelize");
const sequelize = new Sequelize(process.env.DB_URL, {
    dialect: "postgres",
    logging: false,
    pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: true
        }
    }
});

module.exports = sequelize;


// import models
const userDef = require("../models/user_models/userAuth");
const groupDef = require("../models/user_models/group");
const groupMemberDef = require("../models/user_models/groupMember");
const expenseDataDef = require("../models/expense_models/expenseData");
const expenseMemberDef = require("../models/expense_models/expenseMember");
const expenseSettlementDef = require("../models/expense_models/expenseSettlement");
const sessionDef = require("../models/user_models/refreshSession");
const notificationDef = require("../models/user_models/notification");

// define models
const User = sequelize.define("User", userDef, { timestamps: true });
const Group = sequelize.define("Group", groupDef, { timestamps: true });
const GroupMember = sequelize.define("GroupMember", groupMemberDef, { timestamps: true });
const ExpenseData = sequelize.define("ExpenseData", expenseDataDef, { timestamps: true });
const ExpenseMember = sequelize.define("ExpenseMember", expenseMemberDef, { timestamps: true });
const ExpenseSettlement = sequelize.define("ExpenseSettlement", expenseSettlementDef, { timestamps: true });
const Session = sequelize.define("Session", sessionDef, { timestamps: true });
const Notification = sequelize.define("Notification", notificationDef, {
    timestamps: true,
    indexes: [
        { fields: ["userId", "createdAt"] },
        { fields: ["userId", "readAt"] }
    ]
});

// define associations
User.hasMany(GroupMember, { foreignKey: "userId" });
GroupMember.belongsTo(User, { foreignKey: "userId" });

Group.hasMany(GroupMember, { foreignKey: "groupId" });
GroupMember.belongsTo(Group, { foreignKey: "groupId" });

Group.hasMany(ExpenseData, { foreignKey: "groupId" });
ExpenseData.belongsTo(Group, { foreignKey: "groupId" });

User.hasMany(Session, { foreignKey: "userId" });
Session.belongsTo(User, { foreignKey: "userId", as: 'user' });

ExpenseData.hasMany(ExpenseMember, { foreignKey: "expenseId", as: 'members' });
ExpenseMember.belongsTo(ExpenseData, { foreignKey: "expenseId" });
ExpenseMember.belongsTo(User, { foreignKey: "userId", as: 'user' });

ExpenseData.belongsTo(User, { foreignKey: 'paidBy', as: 'paidByUser' });
User.hasMany(ExpenseData, { foreignKey: 'paidBy', as: 'paidExpenses' });

ExpenseSettlement.belongsTo(User, { foreignKey: 'payer_id', as: 'payer' });
ExpenseSettlement.belongsTo(User, { foreignKey: 'receiver_id', as: 'receiver' });
User.hasMany(ExpenseSettlement, { foreignKey: 'payer_id', as: 'payerSettlements' });
User.hasMany(ExpenseSettlement, { foreignKey: 'receiver_id', as: 'receiverSettlements' });


const connectDB = async () => {
    await sequelize.authenticate();
    console.log("DB connected successfully");
}

module.exports = {
    sequelize,
    connectDB,
    User,
    Group,
    GroupMember,
    ExpenseData,
    Session,
    ExpenseMember,
    ExpenseSettlement,
    Notification
};