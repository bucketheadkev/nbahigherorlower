-- Staging-only verify after pasting 2026-11-23_SECURE_coin_bank_REVIEW.sql
-- Run in the STAGING project SQL Editor. Do not run against production casually.

select to_regprocedure('public.classic_spin(uuid,text)') as classic_spin;
select to_regprocedure('public.classic_run_submit(uuid)') as classic_run_submit;
select to_regprocedure('public.classic_swap_commit(uuid,text,text,text)') as classic_swap;
select to_regprocedure('public._iap_recompute_entitlements(uuid)') as iap_recompute;
select to_regprocedure('public.credit_my_coins(bigint,text,text)') as credit_my_coins_should_be_null;

select provolatile
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = '_trivia_shuffle_choices';
-- expect: v

select
  has_function_privilege('authenticated', 'public.coin_post(uuid,bigint,text,text,jsonb)', 'execute') as auth_can_coin_post,
  has_function_privilege('service_role', 'public.coin_grant_iap(uuid,text,text,text,text,timestamptz)', 'execute') as svc_can_grant_iap;
-- expect: false, true

select to_regclass('public.classic_run_actions') as actions;
select to_regclass('public.iap_refund_debts') as refund_debts;

select indexname
from pg_indexes
where schemaname = 'public' and indexname = 'trivia_challenges_session_diff_uidx';
