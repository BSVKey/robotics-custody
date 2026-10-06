import test from "node:test";
import assert from "node:assert/strict";
import { genKeypair } from "../lib/keys.mjs";
import { signRecord, contentOf, registry } from "../lib/record.mjs";
import { handoff, payment, gap } from "../src/records.mjs";
import { verifyTrail, verifyPayments, verifyOffline } from "../src/verify.mjs";

function floor({ revokeBAt } = {}) {
  const ids = [["a", "op1"], ["b", "op2"], ["c", "op2"]];
  const kp = Object.fromEntries(ids.map(([id]) => [id, genKeypair()]));
  const robots = registry(ids.map(([id, operator]) => ({ id, operator, pub: kp[id].pub, ...(id === "b" && revokeBAt !== undefined ? { revokedAt: revokeBAt } : {}) })));
  const h1 = handoff(kp.a, { itemId: "I1", from: "dock", to: "a", at: 10 });
  const h2 = handoff(kp.b, { itemId: "I1", from: "a", to: "b", at: 20, prev: h1.claimId });
  const h3 = handoff(kp.c, { itemId: "I1", from: "b", to: "c", at: 30, prev: h2.claimId });
  const p2 = payment(kp.b, { handoffId: h2.claimId, payer: "b", payee: "a", at: 20, amountCents: 5, settlementRef: "r2" });
  const p3 = payment(kp.c, { handoffId: h3.claimId, payer: "c", payee: "b", at: 30, amountCents: 5, settlementRef: "r3" });
  return { kp, robots, trail: [h1, h2, h3], payments: [p2, p3] };
}

test("a trail verifies and the last signer holds the item", () => {
  const f = floor();
  const r = verifyTrail("I1", f.trail, { robots: f.robots });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.holder, "c");
  assert.equal(r.operator, "op2");
  const short = verifyTrail("I1", f.trail.slice(0, 2), { robots: f.robots });
  assert.equal(short.holder, "b");
});

test("a deliverer cannot sign for the receiver; removed hops and revoked keys are caught", () => {
  const f = floor({ revokeBAt: 15 });
  const reasons = (t) => verifyTrail("I1", t, { robots: f.robots }).problems.map((p) => p.reason);
  assert.ok(reasons([f.trail[0], handoff(f.kp.a, { itemId: "I1", from: "a", to: "b", at: 20, prev: f.trail[0].claimId })]).includes("signer_not_registered_key"));
  assert.ok(reasons([f.trail[0], f.trail[2]]).includes("trail_break"));
  assert.ok(reasons(f.trail).includes("key_revoked"));
});

test("payments: bound, once, right parties, right rate", () => {
  const f = floor();
  const ok = verifyPayments(f.trail, f.payments, { robots: f.robots, expectedCents: 5 });
  assert.equal(ok.ok, true, JSON.stringify(ok.problems));
  assert.equal(ok.acceptedPayments.length, 2);
  assert.deepEqual(ok.unpaid, []);
  const r = (ps) => verifyPayments(f.trail, ps, { robots: f.robots, expectedCents: 5 }).problems.map((p) => p.reason);
  assert.ok(r([...f.payments, f.payments[0]]).includes("handoff_paid_twice"));
  assert.ok(r([payment(f.kp.c, { handoffId: f.trail[1].claimId, payer: "c", payee: "a", at: 20, amountCents: 5, settlementRef: "x" })]).includes("payment_parties_do_not_match_handoff"));
  assert.ok(r([signRecord(f.kp.b, { ...contentOf(f.payments[0]), amountCents: 50 })]).includes("amount_not_the_agreed_rate"));
  assert.ok(r([payment(f.kp.b, { handoffId: "0x00", payer: "b", payee: "a", at: 20, amountCents: 5, settlementRef: "x" })]).includes("payment_not_bound_to_a_handoff"));
  assert.equal(verifyPayments(f.trail, [f.payments[0]], { robots: f.robots }).unpaid.length, 1);
});

test("offline period: exactly the records signed meanwhile, none added or withheld", () => {
  const f = floor();
  const during = [f.trail[1], f.payments[0]];
  const g = gap(f.kp.b, { robot: "b", from: 15, to: 25, records: during });
  const all = [...f.trail, ...f.payments];
  assert.deepEqual(verifyOffline(g, all, { robots: f.robots }), { ok: true, records: 2, minutes: 10 / 60000 });
  assert.equal(verifyOffline(g, all.filter((x) => x !== f.payments[0]), { robots: f.robots }).ok, false);
  assert.equal(verifyOffline(g, [...all, handoff(f.kp.b, { itemId: "I9", from: "a", to: "b", at: 22 })], { robots: f.robots }).ok, false);
});
