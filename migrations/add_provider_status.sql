-- Create provider_status table to track real-time provider availability
CREATE TABLE IF NOT EXISTS provider_service.provider_status (
    provider_id UUID PRIMARY KEY REFERENCES identity_and_user.users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'on_the_way', 'busy', 'offline')),
    current_booking_id UUID REFERENCES booking_and_scheduling.bookings(id) ON DELETE SET NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_provider_status_status ON provider_service.provider_status(status);
CREATE INDEX IF NOT EXISTS idx_provider_status_updated ON provider_service.provider_status(last_updated);

-- Add RLS policies
ALTER TABLE provider_service.provider_status ENABLE ROW LEVEL SECURITY;

-- Providers can read and update their own status
CREATE POLICY provider_status_provider_select ON provider_service.provider_status
    FOR SELECT
    USING (provider_id = auth.uid());

CREATE POLICY provider_status_provider_update ON provider_service.provider_status
    FOR UPDATE
    USING (provider_id = auth.uid());

CREATE POLICY provider_status_provider_insert ON provider_service.provider_status
    FOR INSERT
    WITH CHECK (provider_id = auth.uid());

-- Customers can view provider status (for bookings)
CREATE POLICY provider_status_customer_select ON provider_service.provider_status
    FOR SELECT
    USING (true);

-- Function to automatically update last_updated timestamp
CREATE OR REPLACE FUNCTION provider_service.update_provider_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_provider_status_timestamp
    BEFORE UPDATE ON provider_service.provider_status
    FOR EACH ROW
    EXECUTE FUNCTION provider_service.update_provider_status_timestamp();

COMMENT ON TABLE provider_service.provider_status IS 'Tracks real-time provider availability status';
COMMENT ON COLUMN provider_service.provider_status.status IS 'Provider status: online (available), on_the_way (traveling to job), busy (working), offline (unavailable)';
