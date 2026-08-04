# review/complexity — mission and scope

Source of truth for what this adversary is *for*.

- **Package:** `complexity`
- **Factory routing:** human PR comments are attributed to this adversary only when they match **In scope**.
- **Languages / surfaces:** Any language

## Mission

Review whether implementation complexity is disproportionate to the behavior added.

## In scope (fair miss if humans raised it and we did not)

- Over-abstraction for simple behavior
- Unnecessary indirection / layering
- Complexity that harms maintainability without benefit

## Out of scope (not a miss for this adversary)

- Security specialist findings
- CI
- Narrow race bugs (go-concurrency)

## Factory grading rule

- **In scope + human raised it + this adversary did not surface it** → real miss → suggested issue for **this** package
- **Out of scope** → do not grade as a miss for this adversary
- **Better fit for another adversary** → route there; do not double-count as a miss here
- **Unclear** → prefer out-of-scope for grading
