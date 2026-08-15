-- AlterTable
ALTER TABLE "Business" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_source_externalId_key" ON "Business"("source", "externalId");
