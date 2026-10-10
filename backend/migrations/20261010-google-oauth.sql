BEGIN;

ALTER TABLE "Users"
    ADD COLUMN IF NOT EXISTS "google_id" VARCHAR(255);

ALTER TABLE "Users"
    ALTER COLUMN "password" DROP NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT lower("email")
        FROM "Users"
        GROUP BY lower("email")
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Resolve duplicate emails ignoring case before applying this migration';
    END IF;
END $$;

UPDATE "Users"
    SET "email" = lower("email")
    WHERE "email" <> lower("email");

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique"
    ON "Users" (lower("email"));

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_unique"
    ON "Users" ("google_id")
    WHERE "google_id" IS NOT NULL;

COMMIT;
