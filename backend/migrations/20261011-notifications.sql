BEGIN;

CREATE TABLE "Notifications" (
    "id" UUID PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "groupId" INTEGER,
    "groupName" VARCHAR(255),
    "actorUserId" INTEGER,
    "kind" VARCHAR(32) NOT NULL,
    "message" TEXT NOT NULL,
    "targetTab" VARCHAR(32) NOT NULL,
    "readAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "notifications_user_created_at_idx"
    ON "Notifications" ("userId", "createdAt" DESC);

CREATE INDEX "notifications_user_read_at_idx"
    ON "Notifications" ("userId", "readAt");

COMMIT;
