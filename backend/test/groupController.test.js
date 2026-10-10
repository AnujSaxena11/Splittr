process.env.DB_NAME = "splitter_test";
process.env.DB_USER = "splitter_test";
process.env.DB_PASSWORD = "splitter_test";
process.env.DB_HOST = "127.0.0.1";

const test = require("node:test");
const assert = require("node:assert/strict");
const { sequelize, Group, GroupMember } = require("../config/dbconfig");
const groupController = require("../controllers/groupController");

function responseRecorder() {
    return {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
}

test("group detail denies authenticated users without a membership", async (t) => {
    const oldFindByPk = Group.findByPk;
    const oldFindOne = GroupMember.findOne;
    const oldFindAll = GroupMember.findAll;
    let returnedMembers = false;

    Group.findByPk = async () => ({ id: 42, name: "Private group" });
    GroupMember.findOne = async () => null;
    GroupMember.findAll = async () => {
        returnedMembers = true;
        return [];
    };
    t.after(() => {
        Group.findByPk = oldFindByPk;
        GroupMember.findOne = oldFindOne;
        GroupMember.findAll = oldFindAll;
    });

    const response = responseRecorder();
    await groupController.getGroupById({ params: { groupId: 42 }, user: { userId: 9 } }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.message, "You are not a member of this group");
    assert.equal(returnedMembers, false);
});

test("joining by invite creates a pending membership and normalizes the code", async (t) => {
    const oldFindOne = Group.findOne;
    const oldMembershipFindOne = GroupMember.findOne;
    const oldCreate = GroupMember.create;
    let createdMembership = null;

    Group.findOne = async () => ({ id: 42, ownerId: 99 });
    GroupMember.findOne = async () => null;
    GroupMember.create = async (values) => {
        createdMembership = values;
        return values;
    };
    t.after(() => {
        Group.findOne = oldFindOne;
        GroupMember.findOne = oldMembershipFindOne;
        GroupMember.create = oldCreate;
    });

    const response = responseRecorder();
    await groupController.joinGroup({
        body: { unique_code: "ab12cd34" },
        user: { userId: 7, name: "Test User", email: "test@example.com" }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(createdMembership.groupId, 42);
    assert.equal(createdMembership.userId, 7);
    assert.equal(createdMembership.status, "pending");
    assert.equal(createdMembership.name, "Test User");
});

test("only the group owner can approve a request and accepted count is updated", async (t) => {
    const oldFindByPk = Group.findByPk;
    const oldFindOne = GroupMember.findOne;
    const oldCount = GroupMember.count;
    const oldTransaction = sequelize.transaction;
    const group = {
        id: 42,
        ownerId: 7,
        total_members: 1,
        update: async (values) => Object.assign(group, values)
    };
    const member = {
        status: "pending",
        update: async (values) => Object.assign(member, values)
    };
    Group.findByPk = async () => group;
    sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: "UPDATE" } });
    GroupMember.findOne = async () => member;
    GroupMember.count = async () => 1;
    t.after(() => {
        Group.findByPk = oldFindByPk;
        sequelize.transaction = oldTransaction;
        GroupMember.findOne = oldFindOne;
        GroupMember.count = oldCount;
    });

    const denied = responseRecorder();
    await groupController.acceptJoinRequest({ body: { groupId: 42, userId: 9 }, user: { userId: 8 } }, denied);
    assert.equal(denied.statusCode, 403);

    const accepted = responseRecorder();
    await groupController.acceptJoinRequest({ body: { groupId: 42, userId: 9 }, user: { userId: 7 } }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.equal(member.status, "accepted");
    assert.equal(group.total_members, 2);
});
