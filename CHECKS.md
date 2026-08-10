# Checks — what complexity detects

This file is the **public audit list** of detectors for the **review/complexity** adversary. It reviews *revisions* (diffs), not codebases: every finding is anchored to a change, compared against the pre-change baseline. Complexity review is the easiest place to become a nag machine, so the calibration principles below are product surface, not implementation detail.

Runtime source of truth: [`src/spec.ts`](src/spec.ts) / [`src/rules.ts`](src/rules.ts).

**Scope:** JavaScript/TypeScript sources in the changed set (parser-AST based). Generated code, vendored trees, and lockfiles are excluded.

## Calibration principles (precision stance)

- **Deltas matter more than absolute values.** A 40-complexity function that didn't get worse is not a finding; +8 on a previously simple function is.
- **Low baselines receive strong noise protection.** Small absolute numbers moving around is normal development, not evidence.
- **Added functions need stronger signals than modified functions** — there is no baseline to offend, so the bar is higher.
- **Metric growth alone is not evidence that an implementation is unjustified.** Judgment rules must cite structure, not just numbers.
- **Design heuristics are grouped and normally reported with medium confidence.** They ask a question; they do not declare a pattern wrong.
- **Test changes are a coverage signal, not proof** that every new branch is exercised.
- **Positive signals are reported.** A review tool that only complains teaches people to ignore it.

---

## Deterministic metric rules

Cyclomatic and cognitive values come directly from ESLint and SonarJS; size, parameters, nesting, decision points, error paths, configuration reads, state writes, and recursion come from the parser AST — all compared between revisions.

| Rule | Fires when | Stays quiet when |
| --- | --- | --- |
| `complexity.cyclomatic.increase` | Cyclomatic complexity rises past both a delta and an absolute threshold in one change | Baseline already low; rise proportional to genuinely new behavior with locality |
| `complexity.cognitive.increase` | Cognitive complexity (SonarJS) rises past delta + absolute thresholds | Same protections as cyclomatic |
| `complexity.nesting.depth` | Change deepens nesting beyond threshold in a touched function | Depth pre-existed; early-return refactor opportunities noted, not demanded |
| `complexity.large-function-growth` | An already-large function grows materially instead of being split | Growth is cohesive (one responsibility, contiguous logic) |
| `complexity.parameter-growth` | Parameter list grows past threshold in one change | Options-object refactors; parameters added with clear independent meaning |
| `complexity.magic-conditions` | New branching on unexplained literal values | Named constants/enums; domain-obvious literals (0, 1, empty) |
| `complexity.error-paths` | Change adds error handling that swallows, duplicates, or contradicts existing error flow | Consistent propagation; intentional boundary handlers |
| `complexity.configuration-explosion` | Change adds config reads/flags that multiply the behavior matrix of one unit | Config consolidated behind a typed accessor with defaults |
| `complexity.hidden-state` | Change introduces module-level mutable state or out-of-band writes into previously pure flow | Explicit state containers with ownership; DI-injected state |
| `complexity.recursion-risk` | New/modified recursion without a structural termination guarantee | Base case provably reached; bounded depth documented |
| `complexity.branch-without-tests` | New branches land while the touched files' tests don't change at all | Tests updated in the same change (coverage *signal* only — see principles) |

## Engineering-judgment rules (grouped, medium confidence)

Premature abstraction, indirection, responsibility expansion, and AI overengineering combine multiple structural signals. They intentionally avoid claiming a design pattern is inherently wrong — each finding asks whether the layer owns policy, variation, lifecycle, or another concrete responsibility.

| Rule | Question it asks |
| --- | --- |
| `complexity.abstraction.premature` | Does this new interface/factory/layer have a second concrete user, or a named forthcoming one? |
| `complexity.indirection` | Does each added hop (wrapper, delegate, pass-through) own a decision, or just forward one? |
| `complexity.wrapper.trivial` | Does this new one-use JSX component own behavior, semantics, or reuse that justifies navigating through it? |
| `complexity.responsibility-expansion` | Did an existing unit absorb a new concern that belongs elsewhere? |
| `complexity.ai-overengineering` | Does the change carry hallmark generated-code excess (defensive rethrows, redundant guards, speculative options) without a driving requirement? |

## Positive signals

| Rule | Recognizes |
| --- | --- |
| `complexity.reduced` | Material reduction in both cyclomatic and cognitive complexity |
| `complexity.nesting.flattened` | Flattened nesting / early-return refactors |

A proportional complexity increase with adequate locality is also acknowledged in the review summary rather than flagged.

---

## Out of scope (owned elsewhere)

| Concern | Owner |
| --- | --- |
| Security sinks in JS/TS | `nodejs` / `react` / `nextjs` |
| Type-safety escapes | `typescript` |
| Style/formatting | none — deliberately not judged |
| Go complexity | future `go/*` scope; not this adversary |
