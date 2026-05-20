ALTER TABLE "MessageQueue"
ALTER COLUMN "status" SET DEFAULT 'QUEUED';

UPDATE "MessageQueue"
SET "status" = 'QUEUED'
WHERE "status" = 'PENDING';
