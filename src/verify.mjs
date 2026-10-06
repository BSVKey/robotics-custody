// Verify robot custody: item trails, payments bound to handoffs, and offline periods.
//
// robots: registry() of robot and station keys: { id, pub, operator, validFrom?, revokedAt? }
import { verifyRecord } from "../lib/record.mjs";
import { offlineRoot } from "./records.mjs";

// The record's signer must be the registered key of `who`, valid at the record's time.
function signerIs(r, who, robots) {
  const v = verifyRecord(r);
  if (!v.ok) return v.reason;
  return robots.check(who, v.signer, r.at);
}

// One item's trail of handoffs. The last robot that signed for the item holds it, and its
// operator is answerable for it: a robot that "delivered" without the receiver's signature
// still holds the item.
export function verifyTrail(itemId, trail, { robots }) {
  const problems = [];
  trail.forEach((h, i) => {
    const p = signerIs(h, h.to, robots);
    if (p) problems.push({ reason: p, index: i, robot: h.to });
    if (h.itemId !== itemId) problems.push({ reason: "wrong_item", index: i });
    if (i && (h.prev !== trail[i - 1].claimId || h.from !== trail[i - 1].to)) problems.push({ reason: "trail_break", index: i });
    if (i && h.at < trail[i - 1].at) problems.push({ reason: "time_regression", index: i });
  });
  const holder = trail.at(-1)?.to ?? null;
  return { ok: problems.length === 0, problems, itemId, holder, operator: holder && robots.attrs(holder)?.operator, hops: trail.length };
}

// Payments: each bound to one verified handoff, paid by the receiver to the deliverer, once.
// Returns the accepted payments, the problems, and the handoffs nobody paid for.
export function verifyPayments(handoffs, payments, { robots, expectedCents }) {
  const problems = [];
  const byId = new Map(handoffs.map((h) => [h.claimId, h]));
  const paid = new Set(), accepted = [];
  for (const p of payments) {
    const s = signerIs(p, p.payer, robots);
    if (s) { problems.push({ reason: s, payer: p.payer }); continue; }
    const h = byId.get(p.handoffId);
    if (!h) { problems.push({ reason: "payment_not_bound_to_a_handoff", payer: p.payer }); continue; }
    if (signerIs(h, h.to, robots)) { problems.push({ reason: "payment_for_unverified_handoff", payer: p.payer }); continue; }
    if (p.payer !== h.to || p.payee !== h.from) { problems.push({ reason: "payment_parties_do_not_match_handoff", payer: p.payer, payee: p.payee }); continue; }
    if (paid.has(p.handoffId)) { problems.push({ reason: "handoff_paid_twice", payee: p.payee }); continue; }
    if (expectedCents !== undefined && p.amountCents !== expectedCents) { problems.push({ reason: "amount_not_the_agreed_rate", payee: p.payee }); continue; }
    paid.add(p.handoffId);
    accepted.push(p);
  }
  const unpaid = handoffs.filter((h) => !paid.has(h.claimId) && robots.attrs(h.from)).map((h) => h.claimId);
  return { ok: problems.length === 0, problems, accepted: accepted.length, acceptedPayments: accepted, unpaid };
}

// An offline period: the gap record's root must match exactly the records the robot signed
// in that window, as uploaded.
export function verifyOffline(gapRecord, uploaded, { robots }) {
  const s = signerIs(gapRecord, gapRecord.robot, robots);
  if (s) return { ok: false, reason: s };
  const mine = uploaded.filter((r) => r.at >= gapRecord.from && r.at <= gapRecord.to && verifyRecord(r).signer === robots.attrs(gapRecord.robot)?.pub);
  if (mine.length !== gapRecord.offlineCount || offlineRoot(mine) !== gapRecord.offlineRoot) return { ok: false, reason: "offline_records_do_not_match_gap_record", stated: gapRecord.offlineCount, uploaded: mine.length };
  return { ok: true, records: mine.length, minutes: (gapRecord.to - gapRecord.from) / 60000 };
}
