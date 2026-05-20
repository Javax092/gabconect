CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "mandateId" TEXT,
    "workerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "note" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerHeartbeat_workerName_key" ON "WorkerHeartbeat"("workerName");
CREATE INDEX "WorkerHeartbeat_mandateId_workerName_idx" ON "WorkerHeartbeat"("mandateId", "workerName");
CREATE INDEX "WorkerHeartbeat_lastSeenAt_idx" ON "WorkerHeartbeat"("lastSeenAt");

ALTER TABLE "WorkerHeartbeat"
ADD CONSTRAINT "WorkerHeartbeat_mandateId_fkey"
FOREIGN KEY ("mandateId") REFERENCES "Mandate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
