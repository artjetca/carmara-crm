-- Add contrato and notes fields to customers table
ALTER TABLE customers 
ADD COLUMN contrato TEXT,
ADD COLUMN notes TEXT;

-- Add comment for the new fields
COMMENT ON COLUMN customers.contrato IS 'Customer contract status';
COMMENT ON COLUMN customers.notes IS 'Additional notes about the customer';