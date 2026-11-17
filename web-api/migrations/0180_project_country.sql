ALTER TABLE projects ADD COLUMN country TEXT CHECK (country IN ('CO', 'ES'));
