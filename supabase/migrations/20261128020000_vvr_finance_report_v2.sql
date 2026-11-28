-- Test purchases (kind 'test') are reported apart from commercial figures. Telegram releases Stars for
-- withdrawal 21 days after a purchase; the report estimates the withdrawable part from the ledger.
create or replace function public.vvr_finance_report(p_actor uuid,p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare admin_role text:=vvr.require_admin(p_actor);
 since timestamptz:=clock_timestamp()-make_interval(days=>least(greatest(coalesce(p_days,30),1),3650));
begin
 return (with l as (
   select f.*,coalesce(o.kind,'gems')='test' as test from vvr.finance_ledger f
   left join vvr.stars_offers o on o.sku=f.note where f.unit='XTR')
 select jsonb_build_object(
  'sales',coalesce(sum(amount) filter (where kind='stars_sale' and not test and at>=since),0),
  'support',coalesce(sum(amount) filter (where kind='stars_support' and at>=since),0),
  'refunds',coalesce(-sum(amount) filter (where kind='stars_refund' and not test and at>=since),0),
  'test',coalesce(sum(amount) filter (where test),0),
  'testCount',count(*) filter (where test and kind<>'stars_refund'),
  'earned',coalesce(sum(amount) filter (where not test),0),
  'withdrawable',greatest(0,coalesce(sum(amount) filter (where kind in ('stars_sale','stars_support') and at<clock_timestamp()-interval '21 days'),0)
    +coalesce(sum(amount) filter (where kind='stars_refund'),0)),
  'payers',(select count(distinct o.player_id) from vvr.stars_orders o join vvr.stars_offers s on s.sku=o.sku
    where o.status='paid' and s.kind<>'test' and o.paid_at>=since),
  'pending',(select count(*) from vvr.stars_orders where status='pending' and created_at>=since),
  'orders',(select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from
    (select o.id,o.sku,o.stars,o.gems,o.status,o.created_at,p.telegram_id as telegram
     from vvr.stars_orders o join vvr.players p on p.id=o.player_id
     where o.status<>'pending' and o.created_at>=since order by o.created_at desc limit 30) r))
 from l);
end;
$$;
notify pgrst,'reload schema';
