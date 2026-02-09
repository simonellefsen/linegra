-- Trigger PostgREST to reload the schema cache so newly created functions are available
select pg_notify('pgrst', 'reload schema');
