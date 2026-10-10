const crypto = require("crypto");
const { sequelize, Group, GroupMember, ExpenseData, ExpenseMember, User } = require("../config/dbconfig");
const { emitGroupUpdate, emitUserUpdate, emitUserNotification, removeUserFromGroup, addUserToGroup } = require("../services/realtime");

exports.createGroup = async (req, res) => {
    try {
        const { name, description } = req.body;
        const unique_code = crypto.randomBytes(8).toString("hex").slice(0, 12).toUpperCase();
        const userId = req.user.userId;
        const newGroup = await sequelize.transaction(async (transaction) => {
            const group = await Group.create({ name, description, ownerId: userId, unique_code, total_members: 1 }, { transaction });
            await GroupMember.create({
                userId,
                groupId: group.id,
                name: req.user.name,
                email: req.user.email,
                role: 'admin',
                status: 'accepted'
            }, { transaction });
            return group;
        });
        emitUserUpdate(userId);
        return res.status(201).json({ group: newGroup });
    }
    catch (e) {
        if (e.name === "SequelizeUniqueConstraintError") {
            return res.status(409).json({ message: "Could not create a unique invite code. Please try again." });
        }
        console.error("Error creating group: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.joinGroup = async (req, res) => {
    try {
        const unique_code = (req.body.unique_code || req.body.groupCode || '').toUpperCase();
        const group = await Group.findOne({ where: { unique_code } });
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }
        if (group.ownerId === req.user.userId) {
            return res.status(400).json({ message: "You are the owner of this group" });
        }
        const existingMember = await GroupMember.findOne({ where: { groupId: group.id, userId: req.user.userId } });
        if (existingMember) {
            return res.status(400).json({ message: "You have already requested or are a member of this group" });
        }
        await GroupMember.create({
            userId: req.user.userId,
            groupId: group.id,
            name: req.user.name,
            email: req.user.email,
            status: 'pending'
        });
        emitGroupUpdate(group.id, {
            actorUserId: req.user.userId,
            notification: { kind: "membership", message: "A new member requested to join", targetTab: "all-expenses" }
        });
        emitUserUpdate(req.user.userId);
        return res.status(200).json({ message: "Join request sent successfully" });
    }
    catch (e) {
        console.error("Error joining group: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.acceptJoinRequest = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const result = await sequelize.transaction(async (transaction) => {
            const group = await Group.findByPk(groupId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!group) return { status: 404, message: "Group not found" };
            if (Number(group.ownerId) !== Number(req.user.userId)) {
                return { status: 403, message: "Only the group owner can accept join requests" };
            }
            const member = await GroupMember.findOne({
                where: { groupId, userId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!member) return { status: 404, message: "Member not found" };
            if (member.status === "accepted") return { status: 409, message: "Member is already accepted" };
            const acceptedCount = await GroupMember.count({ where: { groupId, status: 'accepted' }, transaction });
            await member.update({ status: 'accepted' }, { transaction });
            await group.update({ total_members: acceptedCount + 1 }, { transaction });
            return { status: 200 };
        });
        if (result.message) return res.status(result.status).json({ message: result.message });
        addUserToGroup(userId, groupId);
        emitGroupUpdate(groupId, {
            actorUserId: req.user.userId,
            notification: { kind: "membership", message: "A new member joined the group", targetTab: "all-expenses" }
        });
        emitUserUpdate(userId, groupId);
        return res.status(200).json({ message: "Join request accepted successfully" });
    }
    catch (e) {
        console.error("Error accepting join request: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.rejectJoinRequest = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const result = await sequelize.transaction(async (transaction) => {
            const group = await Group.findByPk(groupId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!group) return { status: 404, message: "Group not found" };
            if (Number(group.ownerId) !== Number(req.user.userId)) {
                return { status: 403, message: "Only the group owner can reject join requests" };
            }
            const member = await GroupMember.findOne({ where: { groupId, userId }, transaction });
            if (!member) return { status: 404, message: "Member not found" };
            await member.destroy({ transaction });
            return { status: 200 };
        });
        if (result.message) return res.status(result.status).json({ message: result.message });
        emitGroupUpdate(groupId, {
            actorUserId: req.user.userId,
            notification: { kind: "membership", message: "A group join request was declined", targetTab: "all-expenses" }
        });
        emitUserNotification(userId, {
            groupId: Number(groupId),
            kind: "membership",
            message: "Your group join request was declined",
            targetTab: "groups"
        });
        emitUserUpdate(userId);
        return res.status(200).json({ message: "Join request rejected successfully" });
    }
    catch (e) {
        console.error("Error rejecting join request: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.leaveGroup = async (req, res) => {
    try {
        const { groupId } = req.body;
        const result = await sequelize.transaction(async (transaction) => {
            const group = await Group.findByPk(groupId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!group) return { status: 404, message: "Group not found" };
            const member = await GroupMember.findOne({ where: { groupId, userId: req.user.userId }, transaction });
            if (!member) return { status: 404, message: "You are not a member of this group" };
            if (member.status !== 'accepted') return { status: 400, message: "Only accepted members can leave the group" };
            if (Number(group.ownerId) === Number(req.user.userId)) {
                return { status: 400, message: "Group admins cannot leave their own group. Please delete it instead." };
            }
            const totalMembers = await GroupMember.count({ where: { groupId, status: "accepted" }, transaction });
            await group.update({ total_members: Math.max(0, totalMembers - 1) }, { transaction });
            await member.destroy({ transaction });
            return { status: 200 };
        });
        if (result.message) return res.status(result.status).json({ message: result.message });
        removeUserFromGroup(req.user.userId, groupId);
        emitGroupUpdate(groupId, {
            actorUserId: req.user.userId,
            notification: { kind: "membership", message: "A member left the group", targetTab: "all-expenses" }
        });
        emitUserUpdate(req.user.userId, groupId);
        return res.status(200).json({ message: "Left group successfully" });
    }
    catch (e) {
        console.error("Error leaving group: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.body;
        const result = await sequelize.transaction(async (transaction) => {
            const group = await Group.findByPk(groupId, { transaction, lock: transaction.LOCK.UPDATE });
            if (!group) return { status: 404, message: "Group not found" };
            const adminMembership = await GroupMember.findOne({
                where: { groupId, userId: req.user.userId, role: 'admin', status: 'accepted' },
                transaction,
            });
            if (!adminMembership && Number(group.ownerId) !== Number(req.user.userId)) {
                return { status: 403, message: "Only a group admin can delete the group" };
            }
            const affectedUserIds = (await GroupMember.findAll({
                where: { groupId },
                attributes: ["userId"],
                transaction,
            })).map((member) => Number(member.userId));
            const expenseIds = (await ExpenseData.findAll({
                attributes: ["id"],
                where: { groupId },
                transaction,
            })).map((expense) => expense.id);
            if (expenseIds.length) await ExpenseMember.destroy({ where: { expenseId: expenseIds }, transaction });
            await ExpenseData.destroy({ where: { groupId }, transaction });
            await GroupMember.destroy({ where: { groupId }, transaction });
            await group.destroy({ transaction });
            return { status: 200, affectedUserIds };
        });
        if (result.message) return res.status(result.status).json({ message: result.message });
        emitGroupUpdate(groupId, { deleted: true, actorUserId: req.user.userId });
        result.affectedUserIds.forEach((userId) => {
            removeUserFromGroup(userId, groupId);
            if (Number(userId) !== Number(req.user.userId)) {
                emitUserNotification(userId, {
                    groupId: Number(groupId),
                    kind: "membership",
                    message: "A group you belonged to was deleted",
                    targetTab: "groups"
                });
            }
            emitUserUpdate(userId);
        });
        return res.status(200).json({ message: "Group deleted successfully" });
    }
    catch (e) {
        console.error("Error deleting group: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getMyGroups = async (req, res) => {
    try {
        const userId = req.user.userId;
        const groups = await GroupMember.findAll({ where: { userId }, include: [{ model: Group }] });
        if (groups.length === 0) {
            return res.status(200).json({ message: "You are not a member of any groups", groups: [] });
        }
        const myGroups = groups.map(gm => ({
            group: gm.Group,
            status: gm.status,
            groupId: gm.groupId,
            membershipId: gm.id
        }));
        return res.status(200).json({ groups: myGroups });
    }
    catch (e) {
        console.error("Error fetching groups: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}

exports.getGroupById = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Group.findByPk(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }
        const membership = await GroupMember.findOne({
            where: { groupId, userId: req.user.userId }
        });
        if (!membership) {
            return res.status(403).json({ message: "You are not a member of this group" });
        }
        const members = await GroupMember.findAll({
            where: { groupId },
            include: [{ model: User, attributes: ['id', 'name', 'email'] }]
        });
        const normalizedMembers = members.map((member) => {
            const value = member.toJSON();
            return {
                ...value,
                name: value.User?.name || 'Group member',
                email: value.User?.email || ''
            };
        });
        return res.status(200).json({ group, members: normalizedMembers });
    }
    catch (e) {
        console.error("Error fetching group: ", e);
        return res.status(500).json({ message: "Internal server error" });
    }
}
