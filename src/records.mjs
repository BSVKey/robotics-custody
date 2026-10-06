// Signed records for robots handing items to each other, paying each other, and catching up
// after time out of contact.
//
//   robot.handoff/1  signed by the RECEIVING robot: "I received this item from that robot at
//                    this time". Each names the item's previous handoff, forming its trail.
//   robot.payment/1  signed by the paying robot: a payment bound to exactly one handoff, from
//                    the robot that received the item to the robot that delivered it.
//   robot.action/1   signed by a robot: it performed this task at this time, with a fingerprint
//                    of the sensor evidence.
//   robot.gap/1      signed by a robot once back in contact: it was offline from..to, and one
//                    Merkle root over every record it signed meanwhile, so nothing can be added
//                    to or withheld from that period afterwards.
import { createHash } from "node:crypto";
import { signRecord } from "../lib/record.mjs";
import { leafHash, buildTree } from "../lib/merkle.mjs";

export const fileFingerprint = (bytes) => "0x" + createHash("sha256").update(bytes).digest("hex");

export const handoff = (kp, { itemId, from, to, at, prev = null }) =>
  signRecord(kp, { kind: "robot.handoff/1", itemId, from, to, at, prev });

export const payment = (kp, { handoffId, payer, payee, at, amountCents, settlementRef }) =>
  signRecord(kp, { kind: "robot.payment/1", handoffId, payer, payee, at, amountCents, settlementRef });

export const action = (kp, { robot, task, at, evidenceFp }) =>
  signRecord(kp, { kind: "robot.action/1", robot, task, at, evidenceFp });

// Root over the claimIds of a robot's offline records, in the order it signed them.
export const offlineRoot = (records) => records.length ? buildTree(records.map((r) => leafHash(Buffer.from(r.claimId, "utf8")))).root : null;

export const gap = (kp, { robot, from, to, records }) =>
  signRecord(kp, { kind: "robot.gap/1", robot, from, to, offlineCount: records.length, offlineRoot: offlineRoot(records) });
