---
"@cartesi/cli": patch
---

Recognize the four terminal application states the node reports (`GUEST_EXCEPTION`, `MACHINE_HALTED`, `MCYCLE_OVERFLOW`, `UNEXPECTED_YIELD`) and surface the node's `reason` diagnostic alongside them.
