const test = require("node:test");
const assert = require("node:assert/strict");
const routers = {
    auth: require("../routes/authRoute"),
    self: require("../routes/selfExpenseRoute"),
    group: require("../routes/groupRoute"),
    split: require("../routes/expenseRoute"),
    reports: require("../routes/reportRoute")
};

function routeManifest(router) {
    return router.stack
        .filter((layer) => layer.route)
        .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`))
        .sort();
}

test("mounted route modules expose the implemented HTTP contract", () => {
    assert.deepEqual(routeManifest(routers.auth), [
        "GET /csrf",
        "GET /google",
        "GET /google/callback",
        "GET /me",
        "GET /user/:id",
        "POST /forgetPassword",
        "POST /login",
        "POST /logout",
        "POST /logoutAll",
        "POST /refresh",
        "POST /signup",
        "POST /verifyOTP"
    ]);
    assert.deepEqual(routeManifest(routers.self), [
        "GET /expense/:id",
        "GET /expenses",
        "POST /expense"
    ]);
    assert.deepEqual(routeManifest(routers.group), [
        "DELETE /deleteGroup",
        "DELETE /leaveGroup",
        "GET /getGroupById/:groupId",
        "GET /getMyGroups",
        "POST /acceptJoinRequest",
        "POST /createGroup",
        "POST /joinGroup",
        "POST /rejectJoinRequest"
    ]);
    assert.deepEqual(routeManifest(routers.split), [
        "GET /get-balances/:groupId",
        "GET /get-expenses/:groupId",
        "GET /get-settlements/:groupId",
        "POST /add-expense/:groupId",
        "POST /settle/:groupId",
        "POST /settlements/:settlementId/respond"
    ]);
    assert.deepEqual(routeManifest(routers.reports), ["GET /expenses"]);
});

test("all protected routes include authentication middleware", () => {
    const protectedRoutes = [
        [routers.auth, ["/logout", "/logoutAll", "/me", "/user/:id"]],
        [routers.self, ["/expense", "/expense/:id", "/expenses"]],
        [routers.group, ["/createGroup", "/joinGroup", "/acceptJoinRequest", "/rejectJoinRequest", "/leaveGroup", "/deleteGroup", "/getMyGroups", "/getGroupById/:groupId"]],
        [routers.split, ["/add-expense/:groupId", "/get-expenses/:groupId", "/get-settlements/:groupId", "/get-balances/:groupId", "/settle/:groupId", "/settlements/:settlementId/respond"]],
        [routers.reports, ["/expenses"]]
    ];

    for (const [router, paths] of protectedRoutes) {
        for (const path of paths) {
            const route = router.stack.find((layer) => layer.route?.path === path)?.route;
            assert.ok(route, `missing route ${path}`);
            assert.ok(route.stack.some((handler) => handler.name === "authMiddleware"), `${path} must be authenticated`);
        }
    }
});
