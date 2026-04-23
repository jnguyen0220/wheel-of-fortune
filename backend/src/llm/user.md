# Wheel Strategy User Prompt

## Portfolio Inventory

{{inventory_section}}

## Cash And Budget

{{cash_section}}

## Minimum Premium Floor

- **Minimum premium per share:** max({{min_premium_abs}}, {{min_premium_pct}}% of strike)

## Covered Call Eligibility

- CC contracts are allowed only when shares >= 100.
- Max CC contracts = floor(shares / 100).
- CC strikes must be above avg cost.

## Options Chains

{{options_blocks}}

## CSP Allocation Guidance

{{csp_allocation_guidance}}

## Input Data Boundary

- The sections above are the complete input dataset for this decision.
- Use only the values provided above.
- Do not infer or invent missing market/account data.
- Do not add filters beyond those already reflected in this input.

## Task

- Select only executable trades.
- CSP uses the shared cash pool.
- CC uses available shares.
- Do not apply additional filtering beyond what is provided in the input data.
- Do not repeat identical legs.
- Every output trade must include a valid ticker from the provided input data.
- Do not emit alternative schemas (no `strategy`, `csp`, or `cc` wrapper objects).

Return only the JSON schema from the system prompt.
