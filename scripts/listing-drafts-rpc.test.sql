-- ════════════════════════════════════════════════════════════════════════
-- LISTING DRAFTS RPC — transactional harness  (List From Phone Handoff)
--
-- Proves the single-active-editor baton, ownership denial, token lifecycle,
-- optimistic revision, and publish idempotency against the REAL schema in one
-- transaction that ALWAYS rolls back (terminal RAISE carries the report).
-- Run as a single statement batch; the ERROR "LD_TEST PASS=…" IS the result.
--
-- Covered (18 checks): create · save+revision · STALE rejection · phone-write
-- blocked pre-handoff · issue (48-hex token) · WRONG_ACCOUNT (no content leak)
-- · redeem transfers baton · phone saves · desktop paused · status truth ·
-- same-owner replay (no second editor) · return-with-save · baton back ·
-- EXPIRED · revoked→INVALID · publish close · idempotent re-publish ·
-- no edits after publish.
--
-- Sellers are simulated via set_config('request.jwt.claims', …) exactly like
-- the proven Saved-Searches security harness. PFC274 = 62.
-- ════════════════════════════════════════════════════════════════════════
-- (Body identical to the verified 2026-07-24 run — see the flight return.
--  The functions under test are the LIVE ones created by migration
--  20260724250000_listing_drafts_cross_device_handoff.sql; this harness
--  seeds throwaway drafts for two real seller ids inside the transaction.)

do $h$
declare A uuid:='77a6893a-54fe-4373-9bf7-3327d0ba69cf'; B uuid:='a1fe1ce9-c17e-4462-ba40-944122913801';
  L uuid; rpt text:=E'
'; np int:=0; nf int:=0;
  did uuid; tok text; tok2 text; tok3 text; res jsonb;
begin
  select id into L from public.listings limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub',A)::text, true);
  did:=public.listing_draft_create('{"brand":"seed"}'::jsonb); if did is not null then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('01 create=%s'||E'
',did is not null);
  res:=public.listing_draft_save_content(did,'{"brand":"x"}'::jsonb,0,'desktop'); if res->>'state'='SAVED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('02 save=%s'||E'
',res->>'state');
  res:=public.listing_draft_save_content(did,'{}'::jsonb,0,'desktop'); if res->>'state'='STALE' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('03 stale=%s'||E'
',res->>'state');
  res:=public.listing_draft_save_content(did,'{}'::jsonb,1,'phone'); if res->>'state'='NOT_ACTIVE_EDITOR' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('04 phone_blocked=%s'||E'
',res->>'state');
  res:=public.listing_draft_issue_handoff(did); tok:=res->>'token'; if res->>'state'='ISSUED' and length(tok)=48 then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('05 issue=%s'||E'
',res->>'state');
  perform set_config('request.jwt.claims', json_build_object('sub',B)::text, true);
  res:=public.listing_draft_redeem_handoff(tok); if res->>'state'='WRONG_ACCOUNT' and res->'content' is null then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('06 wrong_account=%s'||E'
',res->>'state');
  perform set_config('request.jwt.claims', json_build_object('sub',A)::text, true);
  res:=public.listing_draft_redeem_handoff(tok); if res->>'state'='REDEEMED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('07 redeem=%s'||E'
',res->>'state');
  res:=public.listing_draft_save_content(did,'{"brand":"y"}'::jsonb,1,'phone'); if res->>'state'='SAVED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('08 phone_saves=%s'||E'
',res->>'state');
  res:=public.listing_draft_save_content(did,'{}'::jsonb,2,'desktop'); if res->>'state'='NOT_ACTIVE_EDITOR' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('09 desktop_paused=%s'||E'
',res->>'state');
  res:=public.listing_draft_status(did); if res->>'active_editor'='phone' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('10 status=%s'||E'
',res->>'active_editor');
  res:=public.listing_draft_redeem_handoff(tok); if res->>'state'='REDEEMED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('11 replay=%s'||E'
',res->>'state');
  res:=public.listing_draft_return_authority(did,'{"brand":"z"}'::jsonb,2); if res->>'state'='RETURNED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('12 return=%s'||E'
',res->>'state');
  res:=public.listing_draft_status(did); if res->>'active_editor'='desktop' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('13 back=%s'||E'
',res->>'active_editor');
  res:=public.listing_draft_issue_handoff(did); tok2:=res->>'token'; update public.listing_drafts set handoff_expires_at=now()-interval '1 hour' where id=did;
  res:=public.listing_draft_redeem_handoff(tok2); if res->>'state'='EXPIRED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('14 expired=%s'||E'
',res->>'state');
  res:=public.listing_draft_issue_handoff(did); tok3:=res->>'token'; perform public.listing_draft_revoke_handoff(did);
  res:=public.listing_draft_redeem_handoff(tok3); if res->>'state'='INVALID' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('15 revoked=%s'||E'
',res->>'state');
  res:=public.listing_draft_mark_published(did,L); if res->>'state'='PUBLISHED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('16 publish=%s'||E'
',res->>'state');
  res:=public.listing_draft_mark_published(did,L); if res->>'state'='ALREADY_PUBLISHED' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('17 idempotent=%s'||E'
',res->>'state');
  res:=public.listing_draft_save_content(did,'{}'::jsonb,3,'desktop'); if res->>'state'='NOT_ACTIVE' then np:=np+1; else nf:=nf+1; end if; rpt:=rpt||format('18 closed=%s'||E'
',res->>'state');
  raise exception E'LD_TEST PASS=% FAIL=%
%',np,nf,rpt;
end $h$;
