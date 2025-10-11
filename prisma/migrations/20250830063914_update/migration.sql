/*
  Warnings:

  - You are about to drop the `Location` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Location" DROP CONSTRAINT "Location_jobId_fkey";

-- AlterTable
ALTER TABLE "public"."Job" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "experience" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "locationTitle" TEXT,
ADD COLUMN     "requirements" TEXT;

-- DropTable
DROP TABLE "public"."Location";
