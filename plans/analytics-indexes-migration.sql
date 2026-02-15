-- ============================================================
-- Analytics Indexes Migration
-- Adds indexes to support dashboard analytics queries.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Ticket timestamps for daily sales queries
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

-- Ticket event_id for per-event aggregation
CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets(event_id);

-- Ticket tier lookups
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type_id ON tickets(ticket_type_id);

-- Orders date range queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
