# Complexity adversary

Complexity reviews a pull request or repository for implementation complexity that appears disproportionate to the behavior being added.

It is built around one review question:

> Did this code become more complicated than it needed to be?

The adversary does not enforce a global complexity budget. It compares changed functions with their previous versions, combines established static metrics with structural design signals, and produces a small number of synthesized engineering findings.

## What it analyzes

The initial release supports JavaScript and TypeScript, including JSX and TSX.

- ESLint supplies cyclomatic complexity.
- SonarJS supplies cognitive complexity.
- The TypeScript ESLint parser supplies function boundaries and structural signals such as nesting, parameter growth, state mutation, boolean expressions, recursion, configuration reads, wrappers, interfaces, factories, and generics.
- Git supplies the previous source and changed-line locations.

Named complexity metrics are never reimplemented by this adversary.

## Baseline selection

Complexity prefers a real change baseline:

1. Uncommitted changes are compared with `HEAD`.
2. A branch is compared with its merge base against `origin/main`, `origin/master`, `main`, or `master` when available.
3. A committed change falls back to `HEAD^`.
4. Without a usable git delta, the adversary performs a conservative repository snapshot review.

Diff-aware findings always point to current changed code. Added functions require a higher absolute signal than modified functions because there is no previous implementation to compare.

## Rules

| Rule | Purpose |
| --- | --- |
| `complexity.cyclomatic.increase` | Material cyclomatic growth from an established analyzer |
| `complexity.cognitive.increase` | Material cognitive-complexity growth from SonarJS |
| `complexity.nesting.depth` | Increased control-flow nesting |
| `complexity.large-function-growth` | Disproportionate relative and absolute function growth |
| `complexity.parameter-growth` | Expanding parameter lists |
| `complexity.abstraction.premature` | New interfaces, factories, or generics with little demonstrated variation |
| `complexity.indirection` | Long forwarding-only call chains |
| `complexity.ai-overengineering` | Synthesized architecture, indirection, and complexity signals |
| `complexity.branch-without-tests` | Material decision growth without changed tests |
| `complexity.responsibility-expansion` | Parsing, validation, orchestration, persistence, and formatting accumulating together |
| `complexity.hidden-state` | Growth in mutable module, instance, global, or cache state |
| `complexity.magic-conditions` | Rapidly expanding boolean expressions |
| `complexity.configuration-explosion` | Rapid growth in configuration fields consumed by a function |
| `complexity.recursion-risk` | Multiple or expanding recursive paths |
| `complexity.error-paths` | Expanding throws, catches, cleanup, and error branches |

Architectural rules use medium confidence by default. A single interface with one implementation is not automatically a defect; the adversary looks for grouped evidence and phrases the recommendation as a design question rather than a prohibition.

## Review behavior

Related observations are grouped into one finding with up to five pieces of evidence. Every function-level evidence item includes the previous and current values for:

- cyclomatic complexity
- cognitive complexity
- nesting depth
- lines of code
- parameters
- structural decision points

The overall assessment explains whether the implementation became easier or harder to follow and whether the increase appears proportionate. Complexity reductions and flattened nesting are included as positive signals.

## Development

```sh
npm install
npm test
../adversary/bin/adversary validate .
../adversary/bin/adversary pack --check .
```

The release artifact is a self-contained ESM bundle and does not require `node_modules` at execution time.

## Automatic detection

`adversary auto` selects the Complexity adversary when supported JavaScript or TypeScript source files change.
