/*
  Warnings:

  - The values [COMPLETED] on the enum `QueueStatus` will be removed. If these variants are still used in the database, this will fail.
  - The `priority` column on the `MessageQueue` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `MessageQueue` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QueuePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- AlterEnum
BEGIN;
CREATE TYPE "QueueStatus_new" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');
ALTER TABLE "public"."MessageQueue" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "MessageQueue" ALTER COLUMN "status" TYPE "QueueStatus_new" USING ("status"::text::"QueueStatus_new");
ALTER TYPE "QueueStatus" RENAME TO "QueueStatus_old";
ALTER TYPE "QueueStatus_new" RENAME TO "QueueStatus";
DROP TYPE "public"."QueueStatus_old";
ALTER TABLE "MessageQueue" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MessageQueue" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "priority",
ADD COLUMN     "priority" "QueuePriority" NOT NULL DEFAULT 'NORMAL';
