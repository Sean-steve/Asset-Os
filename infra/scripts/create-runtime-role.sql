\set ON_ERROR_STOP on
-- The role password comes from psql's variable expansion, not a committed literal.
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', 'asset_os_app', :'role_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'asset_os_app') \gexec
SELECT format('ALTER ROLE %I WITH PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
              'asset_os_app', :'role_password') \gexec
