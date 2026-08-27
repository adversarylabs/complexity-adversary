# review/complexity — mission and scope

Source of truth for what this adversary is *for*.

- **Package:** `complexity`
- **Factory routing:** human PR comments are attributed to this adversary only when they match **In scope**.
- **Languages / surfaces:** JavaScript and TypeScript for metric and design analysis; Python and Rust for the exact structural-clone signal. Other languages are outside current automated grading coverage.

## Mission

Review whether implementation complexity is disproportionate to the behavior added.

## In scope (fair miss if humans raised it and we did not)

- Over-abstraction for simple behavior
- Unnecessary indirection / layering
- One-use JSX layout wrappers that add no behavior, semantics, or demonstrated reuse
- Newly copied same-file multi-step operations when the base already had one reusable implementation
- Complexity that harms maintainability without benefit

## Out of scope (not a miss for this adversary)

- Security specialist findings
- CI
- Narrow race bugs (go-concurrency)
- Generic clone counting, unchanged duplication, short idioms, and intentionally independent protocol symmetry

## Factory grading rule

- **In scope + human raised it + this adversary did not surface it** → real miss → suggested issue for **this** package
- **Out of scope** → do not grade as a miss for this adversary
- **Better fit for another adversary** → route there; do not double-count as a miss here
- **Unclear** → prefer out-of-scope for grading
