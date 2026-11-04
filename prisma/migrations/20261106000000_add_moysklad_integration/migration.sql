ALTER TABLE "Tea"
ADD COLUMN "moyskladAssortmentId" TEXT;

CREATE UNIQUE INDEX "Tea_moyskladAssortmentId_key"
ON "Tea"("moyskladAssortmentId");

ALTER TABLE "Order"
ADD COLUMN "checkoutKey" TEXT,
ADD COLUMN "moyskladOrderId" TEXT,
ADD COLUMN "moyskladSyncRequired" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");
CREATE UNIQUE INDEX "Order_moyskladOrderId_key" ON "Order"("moyskladOrderId");

ALTER TABLE "OrderItem"
ADD COLUMN "teaId" INTEGER,
ADD COLUMN "moyskladAssortmentId" TEXT;
