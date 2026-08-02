-- AlterEnum
ALTER TYPE "IncidentSource" ADD VALUE 'explicit_fail';

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "errorRedactedByServer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "errorText" TEXT;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "lastCheckedAt" TIMESTAMP(3);
