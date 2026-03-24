-- Allow anonymous (anon key) read access to tables the frontend needs
-- The anon key is safe to expose — RLS controls what it can do

create policy "Public read access to orders"
  on public.orders for select
  using (true);

create policy "Public read access to dispatch_logs"
  on public.dispatch_logs for select
  using (true);

create policy "Public read access to drivers"
  on public.drivers for select
  using (true);

create policy "Public read access to payroll"
  on public.payroll for select
  using (true);

create policy "Public read access to routing_rules"
  on public.routing_rules for select
  using (true);

create policy "Public read access to unassigned_orders"
  on public.unassigned_orders for select
  using (true);
