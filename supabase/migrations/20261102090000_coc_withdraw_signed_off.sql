-- Withdraw a signed-off COC certificate row that should never count: a duplicate / blank shell
-- of a certificate already linked, a certificate filed under the wrong site, or a certificate of a
-- tenancy that no longer exists. The row is kept for audit and parked as 'rejected' (excluded from
-- every live count, like a rejected proposed row). Admin only. Nothing is deleted.
--
-- The signed-off guard trigger normally refuses any change to signed_off_at; the withdraw function
-- sets a transaction-local flag that the guard honours for this one transition only.

create or replace function public.coc_certificates_guard_signed_off()
returns trigger language plpgsql as $fn$
begin
  if old.signed_off_at is not null
     and coalesce(current_setting('app.coc_withdraw', true), '') = 'on'
     and new.review_status = 'rejected' and new.signed_off_at is null
     and new.proposed_verdict      is not distinct from old.proposed_verdict
     and new.rule_results          is not distinct from old.rule_results
     and new.source_content_hash   is not distinct from old.source_content_hash
     and new.superseded_at         is not distinct from old.superseded_at then
    return new; -- withdraw_coc_certificate: only status, sign-off stamp and note change
  end if;
  if old.signed_off_at is not null and (
       new.proposed_verdict      is distinct from old.proposed_verdict
    or new.rule_results          is distinct from old.rule_results
    or new.source_content_hash   is distinct from old.source_content_hash
    or new.superseded_at         is distinct from old.superseded_at
    or new.signed_off_at         is distinct from old.signed_off_at
    or new.signed_off_by         is distinct from old.signed_off_by
  ) then
    raise exception 'coc_certificates %: row is signed off (%); refusing to change it', old.id, old.signed_off_at;
  end if;
  return new;
end;
$fn$;

create or replace function public.withdraw_coc_certificate(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $fn$
declare c public.coc_certificates;
begin
  if not public.has_role(auth.uid(), 'Admin') then
    raise exception 'withdraw requires the Admin role';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'withdraw needs a note saying why the row does not count';
  end if;
  select * into c from public.coc_certificates where id = p_id for update;
  if not found then raise exception 'coc_certificates % not found', p_id; end if;
  if c.superseded_at is not null or c.review_status = 'rejected' then
    raise exception 'coc_certificates % is not a live row (%, superseded %)', p_id, c.review_status, c.superseded_at;
  end if;
  perform set_config('app.coc_withdraw', 'on', true);
  update public.coc_certificates
     set review_status = 'rejected', signed_off_at = null,
         sign_off_note = concat_ws(' | ', nullif(trim(sign_off_note), ''),
           format('withdrawn %s by %s: %s (was %s, signed off %s, verdict %s)', to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI'), auth.uid(), p_note, c.review_status, c.signed_off_at, c.verdict)),
         updated_at = now()
   where id = p_id;
  perform set_config('app.coc_withdraw', 'off', true);
end;
$fn$;

revoke all on function public.withdraw_coc_certificate(uuid, text) from public;
grant execute on function public.withdraw_coc_certificate(uuid, text) to authenticated;
