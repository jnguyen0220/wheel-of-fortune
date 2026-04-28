# =========================
# WHEEL STRATEGY RULE SET
# =========================

enum WheelState:
    CASH        # Selling cash‑secured puts
    SHARES      # Selling covered calls

struct PortfolioState:
    wheel_state: WheelState
    cash_available: float
    shares_owned: int
    underlying: string

struct Rules:
    dte_range = [14, 45]              # days to expiration
    delta_range_put = [-0.30, -0.15]
    delta_range_call = [0.15, 0.30]
    min_open_interest = 500
    max_contracts = 1
    earnings_warning_days = 14


function generate_wheel_candidates(
    options_chain,
    portfolio: PortfolioState,
    rules: Rules,
    market_context
):
    candidates = []

    for option in options_chain:

        # --- State gate ---
        if portfolio.wheel_state == CASH:
            if option.type != PUT: continue
            if option.strike * 100 > portfolio.cash_available: continue
            if option.delta not in rules.delta_range_put: continue

        if portfolio.wheel_state == SHARES:
            if option.type != CALL: continue
            if option.contracts * 100 > portfolio.shares_owned: continue
            if option.delta not in rules.delta_range_call: continue

        # --- Global hard rules ---
        if option.days_to_expiry < rules.dte_range[0]: continue
        if option.days_to_expiry > rules.dte_range[1]: continue
        if option.open_interest < rules.min_open_interest: continue

        # --- Earnings warning (NOT a filter) ---
        option.earnings_warning = (
            market_context.earnings_within_days <= rules.earnings_warning_days
            and option.days_to_expiry > market_context.earnings_within_days
        )

        candidates.append(option)

    # Prefer liquidity + tighter spreads
    sort candidates by (open_interest DESC, bid_ask_spread ASC)

    return first N candidates where N = rules.max_contracts * 5


# NOTE:
# - This function ONLY filters
# - NO optimization
# - NO decision logic
# - NO LLM involvement
``