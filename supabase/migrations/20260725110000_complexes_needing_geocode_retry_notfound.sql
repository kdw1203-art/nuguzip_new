-- complexes_needing_geocode: notfound 재시도 포함 (지오코딩 실패 영구화 해소)
--
-- 기존 RPC 는 complex_geocode 에 행이 아예 없는 단지만 반환했다.
-- 그래서 한 번 notfound 로 저장되면(과거엔 API 오류까지 notfound 로 저장) 영원히
-- 재시도되지 않았다. 이제 status='notfound' 이면서 마지막 시도(geocoded_at)가
-- 7일 이상 지난 단지도 재시도 대상에 포함한다. status='ok' 는 그대로 제외.
-- 앱 쪽(lib/map/complex-geocode.ts)은 재시도 시 geocoded_at 을 갱신하므로
-- notfound 단지는 7일에 1번씩만 큐에 다시 올라온다.

create or replace function public.complexes_needing_geocode(p_limit integer default 200)
returns table(region_name text, complex_name text, address text, trade_count bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select mt.region_name,
         mt.complex_name,
         (array_agg(mt.address order by mt.contract_ym desc))[1] as address,
         count(*)::bigint as trade_count
  from public.market_transactions mt
  left join public.complex_geocode g
    on g.region_name = mt.region_name and g.complex_name = mt.complex_name
  where mt.transaction_type = 'trade'
    and mt.complex_name is not null and mt.complex_name <> ''
    and mt.region_name is not null and mt.region_name <> ''
    and (
      g.region_name is null
      or (
        g.status = 'notfound'
        and (g.geocoded_at is null or g.geocoded_at < now() - interval '7 days')
      )
    )
  group by mt.region_name, mt.complex_name
  order by count(*) desc
  limit greatest(1, least(1000, p_limit));
$function$;
