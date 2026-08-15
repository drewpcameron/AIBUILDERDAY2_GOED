-- CreateEnum
CREATE TYPE "BusinessSource" AS ENUM ('UTAH_REGISTRY', 'TRY_IT_YOURSELF');

-- CreateEnum
CREATE TYPE "OpportunitySource" AS ENUM ('GRANTS_GOV', 'SAM_GOV_ASSISTANCE_LISTINGS', 'SBIR_GOV');

-- CreateEnum
CREATE TYPE "MatchConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'REVIEWED');

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "source" "BusinessSource" NOT NULL DEFAULT 'UTAH_REGISTRY',
    "name" TEXT NOT NULL,
    "entityType" TEXT,
    "filingDate" TIMESTAMP(3),
    "address" TEXT,
    "filingContactEmail" TEXT,
    "websiteUrl" TEXT,
    "productDescription" TEXT,
    "industryGuess" TEXT,
    "naicsCodeGuess" TEXT,
    "employeeCountSignal" TEXT,
    "fundingHistorySignal" TEXT,
    "webEnrichedAt" TIMESTAMP(3),
    "annualRevenue" TEXT,
    "capitalNeed" TEXT,
    "usOwnershipPercent" INTEGER,
    "ownershipDemographics" TEXT,
    "piPrimaryEmployer" TEXT,
    "priorSbirHistory" TEXT,
    "founderEnrichedAt" TIMESTAMP(3),
    "dashboardToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "source" "OpportunitySource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agency" TEXT,
    "description" TEXT NOT NULL,
    "eligibilityText" TEXT,
    "fundingCategory" TEXT,
    "applicationUrl" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "isSbirEligible" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "confidence" "MatchConfidence" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT NOT NULL,
    "caveats" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_dashboardToken_key" ON "Business"("dashboardToken");

-- CreateIndex
CREATE INDEX "Business_dashboardToken_idx" ON "Business"("dashboardToken");

-- CreateIndex
CREATE INDEX "Opportunity_isSbirEligible_idx" ON "Opportunity"("isSbirEligible");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_source_externalId_key" ON "Opportunity"("source", "externalId");

-- CreateIndex
CREATE INDEX "Match_businessId_idx" ON "Match"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_businessId_opportunityId_key" ON "Match"("businessId", "opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_matchId_key" ON "Application"("matchId");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;
