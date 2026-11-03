-- CreateTable
CREATE TABLE "Tea" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDesc" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeaImage" (
    "id" TEXT NOT NULL,
    "teaId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "showInGallery" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TeaImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tea_isActive_sortOrder_idx" ON "Tea"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TeaImage_teaId_url_key" ON "TeaImage"("teaId", "url");

-- CreateIndex
CREATE INDEX "TeaImage_teaId_sortOrder_idx" ON "TeaImage"("teaId", "sortOrder");

-- AddForeignKey
ALTER TABLE "TeaImage" ADD CONSTRAINT "TeaImage_teaId_fkey" FOREIGN KEY ("teaId") REFERENCES "Tea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
