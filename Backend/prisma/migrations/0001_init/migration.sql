-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('agent', 'supervisor');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('Urgent', 'High', 'Normal', 'Low');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('New', 'Open', 'Pending', 'Resolved', 'Closed');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('status_change', 'reassignment', 'reply');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'agent',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requester" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'Normal',
    "category" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'New',
    "primary_assignee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "pending_started_at" TIMESTAMP(3),
    "pending_seconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_collaborators" (
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_collaborators_pkey" PRIMARY KEY ("ticket_id","user_id")
);

-- CreateTable
CREATE TABLE "replies" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "actor_id" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_alerts" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "breached_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,

    CONSTRAINT "sla_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "tickets_archived_at_idx" ON "tickets"("archived_at");

-- CreateIndex
CREATE INDEX "tickets_primary_assignee_id_idx" ON "tickets"("primary_assignee_id");

-- CreateIndex
CREATE INDEX "replies_ticket_id_created_at_idx" ON "replies"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "sla_alerts_acknowledged_at_breached_at_idx" ON "sla_alerts"("acknowledged_at", "breached_at");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_primary_assignee_id_fkey" FOREIGN KEY ("primary_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_collaborators" ADD CONSTRAINT "ticket_collaborators_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_collaborators" ADD CONSTRAINT "ticket_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_alerts" ADD CONSTRAINT "sla_alerts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_alerts" ADD CONSTRAINT "sla_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

