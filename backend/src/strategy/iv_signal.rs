//! IV-Aware Premium Selling Signal — optimized for the wheel strategy.
//!
//! This module answers: **"Is NOW a good time to sell options on this ticker?"**
//!
//! Core insight: the wheel profits from theta decay and IV contraction.
//! The best entries are when IV is elevated relative to realized volatility
//! and the stock is range-bound (not trending hard in either direction).
//!
//! # Signal components (scored 0–100):
//!
//! 1. **IV vs HV spread** (0–25 pts): IV > HV means options are overpriced.
//! 2. **IV Rank estimate** (0–25 pts): Current IV vs recent IV range — high = rich premium.
//! 3. **Bollinger Band width** (0–20 pts): Narrow bands = range-bound = safe for selling.
//! 4. **RSI mean-reversion** (0–15 pts): RSI near 50 = balanced, not overextended.
//! 5. **Price vs moving average alignment** (0–15 pts): Price near MAs = stable regime.
//!
//! # Output:
//! - `premium_score` (0–100): Overall attractiveness of selling premium now.
//! - `regime`: Range-bound, Trending, or Volatile — affects CC vs CSP preference.
//! - Per-component detail for transparency.

use serde::Serialize;

use crate::models::{Candle, OptionsChain, OptionType};

// ── Historical Volatility ─────────────────────────────────────────────────────

/// Compute annualized historical volatility from daily close prices.
/// Uses log-returns with a lookback window.
fn historical_volatility(closes: &[f64], window: usize) -> Option<f64> {
    if closes.len() < window + 1 {
        return None;
    }

    let start = closes.len() - window - 1;
    let slice = &closes[start..];

    let log_returns: Vec<f64> = slice
        .windows(2)
        .map(|w| (w[1] / w[0]).ln())
        .collect();

    if log_returns.is_empty() {
        return None;
    }

    let mean = log_returns.iter().sum::<f64>() / log_returns.len() as f64;
    let variance = log_returns
        .iter()
        .map(|r| (r - mean).powi(2))
        .sum::<f64>()
        / (log_returns.len() - 1).max(1) as f64;

    // Annualize: sqrt(variance) * sqrt(252)
    Some(variance.sqrt() * 252.0_f64.sqrt())
}

/// Compute HV over multiple windows to establish a range for IV rank estimation.
fn hv_range(closes: &[f64]) -> Option<(f64, f64, f64)> {
    // Compute HV at multiple lookback windows to simulate IV history range.
    let windows = [10, 15, 20, 30, 45, 60];
    let mut hvs: Vec<f64> = Vec::new();

    for &w in &windows {
        if let Some(hv) = historical_volatility(closes, w) {
            hvs.push(hv);
        }
    }

    if hvs.is_empty() {
        return None;
    }

    let min_hv = hvs.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_hv = hvs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let current_hv = historical_volatility(closes, 20)?;

    Some((current_hv, min_hv, max_hv))
}

// ── Bollinger Band Analysis ───────────────────────────────────────────────────

/// Bollinger Band metrics for squeeze/expansion detection.
struct BollingerState {
    /// Current bandwidth as percentage: (upper - lower) / middle * 100
    bandwidth_pct: f64,
    /// Average bandwidth over the lookback — used to detect squeeze
    avg_bandwidth_pct: f64,
}

fn bollinger_analysis(closes: &[f64], period: usize, std_mult: f64) -> Option<BollingerState> {
    if closes.len() < period + 20 {
        return None;
    }

    // Compute current BB
    let current_slice = &closes[closes.len() - period..];
    let sma: f64 = current_slice.iter().sum::<f64>() / period as f64;
    let variance: f64 = current_slice
        .iter()
        .map(|x| (x - sma).powi(2))
        .sum::<f64>()
        / period as f64;
    let std_dev = variance.sqrt();

    let upper = sma + std_mult * std_dev;
    let lower = sma - std_mult * std_dev;
    let bandwidth_pct = if sma > 0.0 {
        (upper - lower) / sma * 100.0
    } else {
        0.0
    };

    // Compute average bandwidth over last 20 periods to detect squeeze
    let mut bandwidths: Vec<f64> = Vec::new();
    for i in 0..20 {
        let end = closes.len() - i;
        if end < period {
            break;
        }
        let slice = &closes[end - period..end];
        let m: f64 = slice.iter().sum::<f64>() / period as f64;
        let v: f64 = slice.iter().map(|x| (x - m).powi(2)).sum::<f64>() / period as f64;
        let s = v.sqrt();
        let u = m + std_mult * s;
        let l = m - std_mult * s;
        if m > 0.0 {
            bandwidths.push((u - l) / m * 100.0);
        }
    }

    let avg_bandwidth_pct = if bandwidths.is_empty() {
        bandwidth_pct
    } else {
        bandwidths.iter().sum::<f64>() / bandwidths.len() as f64
    };

    Some(BollingerState {
        bandwidth_pct,
        avg_bandwidth_pct,
    })
}

// ── RSI ───────────────────────────────────────────────────────────────────────

fn rsi(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period + 1 {
        return None;
    }

    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;

    for i in 1..=period {
        let change = closes[i] - closes[i - 1];
        if change > 0.0 {
            avg_gain += change;
        } else {
            avg_loss += change.abs();
        }
    }
    avg_gain /= period as f64;
    avg_loss /= period as f64;

    for i in (period + 1)..closes.len() {
        let change = closes[i] - closes[i - 1];
        if change > 0.0 {
            avg_gain = (avg_gain * (period as f64 - 1.0) + change) / period as f64;
            avg_loss = (avg_loss * (period as f64 - 1.0)) / period as f64;
        } else {
            avg_gain = (avg_gain * (period as f64 - 1.0)) / period as f64;
            avg_loss = (avg_loss * (period as f64 - 1.0) + change.abs()) / period as f64;
        }
    }

    if avg_loss == 0.0 {
        return Some(100.0);
    }
    let rs = avg_gain / avg_loss;
    Some(100.0 - (100.0 / (1.0 + rs)))
}

// ── SMA helper ────────────────────────────────────────────────────────────────

fn sma(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period {
        return None;
    }
    let slice = &closes[closes.len() - period..];
    Some(slice.iter().sum::<f64>() / period as f64)
}

// ── Signal types ──────────────────────────────────────────────────────────────

/// Market regime classification for premium-selling context.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MarketRegime {
    /// Low volatility, price oscillating within bands — ideal for selling both sides.
    RangeBound,
    /// Directional movement — be cautious about selling against the trend.
    Trending,
    /// High volatility, expanded bands — elevated premium but higher risk.
    Volatile,
}

/// Which side is favorable for premium selling given the current setup.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FavoredLeg {
    /// Bullish lean — CSP is safer (sell puts into support).
    Csp,
    /// Bearish lean — CC is safer (sell calls into resistance).
    Cc,
    /// Neutral — both sides are viable.
    Both,
}

/// IV-aware premium selling signal for a single ticker.
#[derive(Debug, Clone, Serialize)]
pub struct IvSignal {
    pub ticker: String,
    /// Overall premium-selling attractiveness (0–100).
    pub premium_score: f64,
    /// Market regime classification.
    pub regime: MarketRegime,
    /// Which wheel leg is favored.
    pub favored_leg: FavoredLeg,
    /// Current ATM implied volatility (annualized, as decimal e.g. 0.35 = 35%).
    pub atm_iv: f64,
    /// 20-day historical volatility (annualized, as decimal).
    pub hv_20: f64,
    /// IV / HV ratio. >1.0 means options are overpriced vs realized moves.
    pub iv_hv_ratio: f64,
    /// Estimated IV rank (0–100). Higher = IV is elevated vs recent range.
    pub iv_rank: f64,
    /// Bollinger Band width percentile (current vs average). <1.0 = squeeze.
    pub bb_squeeze: f64,
    /// RSI (14-period).
    pub rsi: f64,
    /// Current price.
    pub price: f64,
    /// 20-SMA value.
    pub sma_20: f64,
    /// 50-SMA value.
    pub sma_50: f64,
    /// Number of criteria met out of 5.
    pub criteria_met: u8,
    /// Descriptive notes about each signal component.
    pub notes: Vec<String>,
    /// Suggested action based on the signal.
    pub action: String,
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

/// Analyse a ticker's candle history + options chain to produce an IV-aware
/// premium-selling signal.
///
/// Requires at least 60 candles for reliable HV computation.
pub fn analyse(ticker: &str, candles: &[Candle], chain: Option<&OptionsChain>) -> Option<IvSignal> {
    if candles.len() < 60 {
        return None;
    }

    let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
    let n = closes.len();
    let current_price = closes[n - 1];

    // ── Compute indicators ────────────────────────────────────────────────────

    let hv_20 = historical_volatility(&closes, 20)?;
    let (_, hv_min, hv_max) = hv_range(&closes)?;
    let current_rsi = rsi(&closes, 14)?;
    let sma_20_val = sma(&closes, 20)?;
    let sma_50_val = sma(&closes, 50)?;
    let bb = bollinger_analysis(&closes, 20, 2.0)?;

    // ATM IV from options chain (or estimate from HV if no chain available).
    let atm_iv = get_atm_iv(chain, current_price).unwrap_or(hv_20 * 1.2);

    // IV rank: how current ATM IV compares to the HV-derived range.
    // True IV rank requires 52 weeks of IV history we don't have, so we
    // approximate using HV range as a proxy for the IV range.
    let iv_range_span = (hv_max * 1.3) - (hv_min * 0.8); // estimated IV range
    let iv_rank = if iv_range_span > 1e-6 {
        ((atm_iv - hv_min * 0.8) / iv_range_span * 100.0).clamp(0.0, 100.0)
    } else {
        50.0
    };

    let iv_hv_ratio = if hv_20 > 1e-6 { atm_iv / hv_20 } else { 1.0 };

    let bb_squeeze = if bb.avg_bandwidth_pct > 1e-6 {
        bb.bandwidth_pct / bb.avg_bandwidth_pct
    } else {
        1.0
    };

    // ── Score each component ──────────────────────────────────────────────────

    let mut criteria_met: u8 = 0;
    let mut notes: Vec<String> = Vec::new();

    // 1. IV vs HV spread (0–25 pts): IV > HV means options are overpriced.
    let iv_hv_score = if iv_hv_ratio >= 1.3 {
        criteria_met += 1;
        notes.push(format!(
            "IV/HV ratio {:.2} — options significantly overpriced vs realized vol",
            iv_hv_ratio
        ));
        25.0
    } else if iv_hv_ratio >= 1.1 {
        criteria_met += 1;
        notes.push(format!(
            "IV/HV ratio {:.2} — options moderately overpriced",
            iv_hv_ratio
        ));
        (iv_hv_ratio - 1.0) / 0.3 * 25.0
    } else if iv_hv_ratio >= 0.9 {
        notes.push(format!(
            "IV/HV ratio {:.2} — options fairly priced",
            iv_hv_ratio
        ));
        5.0
    } else {
        notes.push(format!(
            "IV/HV ratio {:.2} — options underpriced, poor time to sell",
            iv_hv_ratio
        ));
        0.0
    };

    // 2. IV Rank (0–25 pts): High IV rank = premium is rich.
    let iv_rank_score = if iv_rank >= 60.0 {
        criteria_met += 1;
        notes.push(format!("IV Rank {:.0}% — elevated, rich premium", iv_rank));
        (iv_rank / 100.0 * 25.0).min(25.0)
    } else if iv_rank >= 40.0 {
        notes.push(format!("IV Rank {:.0}% — moderate", iv_rank));
        (iv_rank / 100.0 * 25.0).min(25.0)
    } else {
        notes.push(format!("IV Rank {:.0}% — low, weak premium", iv_rank));
        (iv_rank / 100.0 * 25.0).min(25.0)
    };

    // 3. Bollinger Band width / squeeze (0–20 pts): Narrow = range-bound.
    let bb_score = if bb_squeeze <= 0.8 {
        // Squeeze: bands contracting — stock is consolidating, great for selling.
        criteria_met += 1;
        notes.push(format!(
            "BB squeeze {:.2}x avg — consolidating, low realized movement",
            bb_squeeze
        ));
        20.0
    } else if bb_squeeze <= 1.1 {
        // Normal bandwidth — acceptable
        notes.push(format!("BB width {:.2}x avg — normal range", bb_squeeze));
        14.0
    } else if bb_squeeze <= 1.5 {
        // Expanding — some trend present
        notes.push(format!(
            "BB expanding {:.2}x avg — increased movement",
            bb_squeeze
        ));
        8.0
    } else {
        // Very wide — volatile, risky to sell
        notes.push(format!(
            "BB wide {:.2}x avg — high realized volatility, cautious",
            bb_squeeze
        ));
        3.0
    };

    // 4. RSI mean-reversion (0–15 pts): Near 50 = balanced, ideal for premium selling.
    let rsi_distance_from_50 = (current_rsi - 50.0).abs();
    let rsi_score = if rsi_distance_from_50 <= 10.0 {
        // RSI 40–60: balanced, no strong directional pressure.
        criteria_met += 1;
        notes.push(format!("RSI {:.1} — balanced, no extreme", current_rsi));
        15.0
    } else if rsi_distance_from_50 <= 20.0 {
        // RSI 30–40 or 60–70: mild lean, still acceptable.
        notes.push(format!("RSI {:.1} — mild directional lean", current_rsi));
        10.0
    } else {
        // RSI < 30 or > 70: overextended, risk of snapback.
        notes.push(format!(
            "RSI {:.1} — overextended, risk of sharp reversal",
            current_rsi
        ));
        3.0
    };

    // 5. Price vs MA alignment (0–15 pts): Price near both MAs = stable regime.
    let dist_from_20 = ((current_price - sma_20_val) / current_price).abs();
    let dist_from_50 = ((current_price - sma_50_val) / current_price).abs();
    let ma_score = if dist_from_20 < 0.02 && dist_from_50 < 0.03 {
        // Price hugging both MAs — very stable, ideal.
        criteria_met += 1;
        notes.push(format!(
            "Price near SMA20 ({:.1}%) and SMA50 ({:.1}%) — stable regime",
            dist_from_20 * 100.0,
            dist_from_50 * 100.0
        ));
        15.0
    } else if dist_from_20 < 0.04 || dist_from_50 < 0.05 {
        notes.push(format!(
            "Price {:.1}% from SMA20, {:.1}% from SMA50 — moderate stability",
            dist_from_20 * 100.0,
            dist_from_50 * 100.0
        ));
        10.0
    } else {
        notes.push(format!(
            "Price {:.1}% from SMA20, {:.1}% from SMA50 — extended from MAs",
            dist_from_20 * 100.0,
            dist_from_50 * 100.0
        ));
        4.0
    };

    // ── Regime classification ─────────────────────────────────────────────────
    let regime = if bb_squeeze <= 0.9 && rsi_distance_from_50 <= 15.0 {
        MarketRegime::RangeBound
    } else if bb_squeeze > 1.4 || hv_20 > atm_iv {
        MarketRegime::Volatile
    } else {
        MarketRegime::Trending
    };

    // ── Favored leg ───────────────────────────────────────────────────────────
    let favored_leg = if current_price > sma_50_val && current_rsi >= 45.0 {
        // Above 50-SMA and RSI not weak — bullish lean, CSPs safer.
        FavoredLeg::Csp
    } else if current_price < sma_50_val && current_rsi <= 55.0 {
        // Below 50-SMA and RSI not strong — bearish lean, CCs safer.
        FavoredLeg::Cc
    } else {
        FavoredLeg::Both
    };

    // ── Total score ───────────────────────────────────────────────────────────
    let premium_score = (iv_hv_score + iv_rank_score + bb_score + rsi_score + ma_score)
        .clamp(0.0, 100.0);

    // ── Action recommendation ─────────────────────────────────────────────────
    let action = if premium_score >= 75.0 {
        match (&regime, &favored_leg) {
            (MarketRegime::RangeBound, FavoredLeg::Both) => {
                "Strong sell signal — sell both CSPs and CCs (iron condor regime)".to_string()
            }
            (_, FavoredLeg::Csp) => "Strong sell signal — favor selling CSPs".to_string(),
            (_, FavoredLeg::Cc) => "Strong sell signal — favor selling CCs".to_string(),
            _ => "Strong sell signal — premium is rich".to_string(),
        }
    } else if premium_score >= 55.0 {
        match &favored_leg {
            FavoredLeg::Csp => "Moderate opportunity — CSPs preferred".to_string(),
            FavoredLeg::Cc => "Moderate opportunity — CCs preferred".to_string(),
            FavoredLeg::Both => "Moderate opportunity — either leg viable".to_string(),
        }
    } else if premium_score >= 35.0 {
        "Weak setup — consider waiting for higher IV or tighter range".to_string()
    } else {
        "Poor conditions for premium selling — IV low and/or trend too strong".to_string()
    };

    Some(IvSignal {
        ticker: ticker.to_uppercase(),
        premium_score,
        regime,
        favored_leg,
        atm_iv,
        hv_20,
        iv_hv_ratio,
        iv_rank,
        bb_squeeze,
        rsi: current_rsi,
        price: current_price,
        sma_20: sma_20_val,
        sma_50: sma_50_val,
        criteria_met,
        notes,
        action,
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Extract ATM implied volatility from an options chain.
/// Uses the put closest to the underlying price with 20–50 DTE.
fn get_atm_iv(chain: Option<&OptionsChain>, current_price: f64) -> Option<f64> {
    let chain = chain?;

    // Prefer puts in the 20–50 DTE range (theta sweet spot).
    let candidates: Vec<&crate::models::OptionsContract> = chain
        .contracts
        .iter()
        .filter(|c| {
            c.option_type == OptionType::Put
                && c.implied_volatility > 0.01
                && c.implied_volatility < 5.0
                && c.dte >= 20
                && c.dte <= 50
        })
        .collect();

    if candidates.is_empty() {
        // Fallback: any put with valid IV.
        let all_puts: Vec<&crate::models::OptionsContract> = chain
            .contracts
            .iter()
            .filter(|c| {
                c.option_type == OptionType::Put
                    && c.implied_volatility > 0.01
                    && c.implied_volatility < 5.0
            })
            .collect();

        return all_puts
            .iter()
            .min_by(|a, b| {
                let da = (a.strike - current_price).abs();
                let db = (b.strike - current_price).abs();
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|c| c.implied_volatility);
    }

    candidates
        .iter()
        .min_by(|a, b| {
            let da = (a.strike - current_price).abs();
            let db = (b.strike - current_price).abs();
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|c| c.implied_volatility)
}

/// Compute the wheel quality score adjustment based on the IV signal.
/// Returns a score from -10 to +15 that gets added to the base wheel quality score.
///
/// - High premium_score (≥70) with favored leg alignment → +10 to +15
/// - Moderate premium_score (50–70) → +3 to +10
/// - Low premium_score (<50) → -5 to 0
/// - Regime mismatch (selling into volatile trend) → -5 to -10
pub fn wheel_adjustment(signal: &IvSignal, is_csp: bool) -> (f64, String) {
    let base_adj = if signal.premium_score >= 75.0 {
        10.0
    } else if signal.premium_score >= 55.0 {
        (signal.premium_score - 55.0) / 20.0 * 7.0 + 3.0
    } else if signal.premium_score >= 35.0 {
        0.0
    } else {
        -5.0
    };

    // Bonus for leg alignment
    let leg_bonus = match (&signal.favored_leg, is_csp) {
        (FavoredLeg::Csp, true) | (FavoredLeg::Cc, false) => 5.0,
        (FavoredLeg::Both, _) => 2.5,
        _ => -3.0, // Selling against the favored direction
    };

    // Regime penalty for volatile markets
    let regime_penalty = match &signal.regime {
        MarketRegime::Volatile => -5.0,
        MarketRegime::Trending => -2.0,
        MarketRegime::RangeBound => 2.0,
    };

    let total = (base_adj + leg_bonus + regime_penalty).clamp(-10.0, 15.0);

    let label = format!(
        "IV signal {:.0}/100 ({:?}) — IV/HV {:.2}, IVR {:.0}%",
        signal.premium_score, signal.regime, signal.iv_hv_ratio, signal.iv_rank
    );

    (total, label)
}
