# Complexity adversary

Reviews code changes for implementation complexity that appears disproportionate to the behavior being added.

## Goals

The adversary is designed to produce a small number of high-confidence,
actionable findings grounded in concrete repository evidence. Its review should
be deterministic where possible, explicit about impact, and quiet when the
available evidence does not justify a finding.

## Scope

It evaluates changed JavaScript and TypeScript functions against their previous versions, combining established complexity metrics with structural design signals.

The complete detector or review inventory is maintained in
[CHECKS.md](CHECKS.md).

## Boundaries

It judges complexity introduced by a change, not style, security, type safety, or unchanged legacy complexity.
