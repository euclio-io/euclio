/*
  Warnings:

  - A unique constraint covering the columns `[canaryAddress]` on the table `Workflow` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "sendsArrived" INTEGER,
ADD COLUMN     "sendsDue" INTEGER;

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "canaryAddress" TEXT;

-- CreateTable
CREATE TABLE "CanaryExpectation" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "windowMins" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanaryExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanaryReceipt" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromAddr" TEXT,
    "subjectHash" TEXT,
    "expectationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanaryReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanaryExpectation_workflowId_idx" ON "CanaryExpectation"("workflowId");

-- CreateIndex
CREATE INDEX "CanaryReceipt_workflowId_receivedAt_idx" ON "CanaryReceipt"("workflowId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_canaryAddress_key" ON "Workflow"("canaryAddress");

-- AddForeignKey
ALTER TABLE "CanaryExpectation" ADD CONSTRAINT "CanaryExpectation_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanaryReceipt" ADD CONSTRAINT "CanaryReceipt_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanaryReceipt" ADD CONSTRAINT "CanaryReceipt_expectationId_fkey" FOREIGN KEY ("expectationId") REFERENCES "CanaryExpectation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
