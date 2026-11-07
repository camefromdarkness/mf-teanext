CREATE TABLE "MoyskladApiCircuit" (
    "id" TEXT NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "probeUntil" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "lastCode" INTEGER,
    "lastMessage" VARCHAR(255),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoyskladApiCircuit_pkey" PRIMARY KEY ("id")
);
