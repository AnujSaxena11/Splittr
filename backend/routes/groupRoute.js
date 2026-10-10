const express = require("express");
const { createGroup, joinGroup, acceptJoinRequest, rejectJoinRequest, leaveGroup, deleteGroup, getMyGroups, getGroupById } = require("../controllers/groupController");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const { createGroupSchema } = require("../validations/groupValidator");

router.post("/createGroup", authMiddleware, validate(createGroupSchema), createGroup);
router.post("/joinGroup", authMiddleware, joinGroup);
router.post("/acceptJoinRequest", authMiddleware, acceptJoinRequest);
router.post("/rejectJoinRequest", authMiddleware, rejectJoinRequest);
router.delete("/leaveGroup", authMiddleware, leaveGroup);
router.delete("/deleteGroup", authMiddleware, deleteGroup);
router.get("/getMyGroups", authMiddleware, getMyGroups);
router.get("/getGroupById/:groupId", authMiddleware, getGroupById);

module.exports = router;