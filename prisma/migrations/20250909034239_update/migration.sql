/*
  Warnings:

  - You are about to drop the column `description` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `requirements` on the `Job` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Job" DROP COLUMN "description",
DROP COLUMN "requirements",
ADD COLUMN     "benefits" TEXT[],
ADD COLUMN     "education" TEXT,
ADD COLUMN     "jobplace" TEXT,
ADD COLUMN     "responsibilities" TEXT,
ADD COLUMN     "skills" TEXT,
ADD COLUMN     "vacancies" INTEGER;
