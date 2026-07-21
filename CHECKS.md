# Complexity checks

## Calibration principles

- Deltas matter more than absolute values.
- Low baselines receive strong noise protection.
- Added functions need stronger signals than modified functions.
- Metric growth alone is not evidence that an implementation is unjustified.
- Design heuristics are grouped and normally reported with medium confidence.
- Test changes are a coverage signal, not proof that every new branch is exercised.

## Deterministic metrics

Cyclomatic and cognitive values come directly from ESLint and SonarJS. Function size, parameters, nesting, decision points, error paths, configuration reads, state writes, and recursion are extracted from the parser AST and compared between revisions.

## Engineering-judgment signals

Premature abstraction, indirection, responsibility expansion, and AI overengineering combine multiple structural signals. They intentionally avoid claiming that a design pattern is inherently wrong. Findings ask whether each layer owns policy, variation, lifecycle, or another concrete responsibility.

## Positive signals

The review recognizes material reductions in both cyclomatic and cognitive complexity, flattened nesting, and a proportional complexity increase with adequate locality.
