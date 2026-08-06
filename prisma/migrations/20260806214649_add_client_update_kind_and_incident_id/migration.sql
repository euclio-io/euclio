-- CreateEnum
CREATE TYPE "ClientUpdateKind" AS ENUM ('incident', 'all_clear');

-- AlterTable
ALTER TABLE "ClientUpdate" ADD COLUMN     "incidentId" TEXT,
ADD COLUMN     "kind" "ClientUpdateKind" NOT NULL DEFAULT 'incident';
