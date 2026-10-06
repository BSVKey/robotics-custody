# Robotics Custody

Verifiable robot-to-robot handoffs, payments bound to handoffs, and offline catch-up.

Robots from different vendors and operators hand items to each other with no person
watching, and drop in and out of contact. Here the receiving robot signs for each item it
takes, and pays the robot that delivered it with a payment bound to that one handoff. A
robot that loses its link keeps signing, and when it reconnects signs one record that
accounts for everything it signed meanwhile. When an item goes missing, the last robot
that signed for it, and its operator, answer for it.

```
npm test          # offline, zero dependencies
node demo.mjs     # 7 robots from 2 operators move 40 totes across a shared floor
```

## What the demo shows

```
7 robots from 2 operators, 40 totes, 199 signed handoffs, 159 payments at 3 cents per hop
Every tote's trail verified: PASS
  TOTE-0031 not packed. Last signed for by botco-amr-2 (operator botco): that operator answers for it
botco-amr-2 offline 08:30:00 to 08:50:00: 14 records signed meanwhile, all accounted for by its catch-up record
Payments verified: PASS, 159 bound to handoffs, 0 unpaid

Tampering:
  botco-amr-2 claims it handed TOTE-0031 to packing            caught
  sorter's handoff removed from a trail                        caught
  handoff signed with acme-amr-2's key after it was revoked    caught
  botco-amr-1 bills the same handoff twice                     caught
  pack-1 pays for a handoff that never happened                caught
  a payment's amount raised from 3 to 30 cents                 caught
  a record withheld from botco-amr-2's offline period          caught
  a record added to botco-amr-2's offline period afterwards    caught
```

All robots, operators and amounts in the demo are sample data.

## Records

| Record | Signed by | Says |
|---|---|---|
| `robot.handoff/1` | the receiving robot | received this item from that robot at this time; names the item's previous handoff |
| `robot.payment/1` | the paying robot | a payment bound to exactly one handoff, from the receiver to the deliverer |
| `robot.action/1` | a robot | performed this task at this time, with a fingerprint of the sensor evidence |
| `robot.gap/1` | a robot, once back in contact | offline from..to, and one Merkle root over every record it signed meanwhile |

All records use canonical JSON, a SHA-256 content id and an Ed25519 signature.

## Rules the verifier applies

- Every record is signed by the registered key of the robot it names, valid at the
  record's time. Keys come from the verifier's registry; revoked keys are refused.
- A robot cannot sign for the robot it handed to, so an item leaves a robot's books only
  once the receiver has signed for it.
- An item's handoffs chain in order, each from the previous holder.
- A payment must be bound to a verified handoff, paid by its receiver to its deliverer,
  once, at the agreed rate.
- A catch-up record must account for exactly the records its robot signed while offline:
  none added afterwards, none withheld.

## Scope

We record what happened; we do not control the robot or its safety functions.

## License

Apache License 2.0. Copyright 2026 Embryo Space Inc. (DBA BSVKey).
