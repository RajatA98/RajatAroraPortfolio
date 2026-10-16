---
title: "Dual-core pipelined MIPS32 processor"
order: 7
draft: false
kind: repo
tagline: "A dual-core, five-stage pipelined MIPS32 in SystemVerilog with snooping cache coherence."
stack: ["SystemVerilog", "Questa", "MIPS assembly", "Python"]
links:
  github: https://github.com/RajatA98/437-MIPS_Processor
  diagram: /diagrams/mips-architecture.svg
problem: "University coursework at Purdue, before the turning point: design a working processor in hardware description code, then make it run real programs on two cores at once. There is no debugger to lean on, only waveforms and test programs."
hardPart: "Two cores with private caches can each hold a stale copy of the same memory, so the caches have to watch each other's bus traffic and invalidate or write back at the right moment. That had to hold up alongside a five-stage pipeline with full forwarding, a hazard unit and atomic load-linked and store-conditional instructions."
decision: "Kept the caches coherent with a snooping MSI protocol on a shared bus controller rather than a directory, because with two cores a broadcast snoop is simpler to verify and costs little bandwidth."
outcome: "A dual-core, five-stage pipelined MIPS32 with instruction and data caches, MSI coherence and LL/SC atomics, verified in Questa against reference traces with 90% statement coverage and 100% FSM coverage. This is where the habit of proving that something works began."
figure:
  value: "100%"
  note: "FSM coverage in Questa verification (90% statement coverage)"
  cleared: true
redacted: false
---
