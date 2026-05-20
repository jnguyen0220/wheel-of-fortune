//! EMA Pullback Strategy — directional CALL/PUT signal scanner.
//!
//! Optimized for wheel strategy with 14–25 DTE contracts.
//! Uses EMA50 as trend filter and EMA20 as entry trigger.
//!
//! # CALLS (bullish setup — sell CSPs)
//! - Price above EMA50 (trend filter)
//! - EMA50 sloping up
//! - Pullback to EMA20 (entry trigger)
//! - Bounce candle (close > open, low near EMA20)
//! - RSI > 50
//! - Volume increasing
//! - Exit: lose EMA20 or EMA50 flattens
//!
//! # PUTS (bearish setup — sell CCs)
//! - Price below EMA50 (trend filter)
//! - EMA50 sloping down
//! - Retrace to EMA20 (entry trigger)
//! - Rejection candle (close < open, high near EMA20)
//! - RSI < 50
//! - Volume increasing
//! - Exit: reclaim EMA20 or EMA50 flattens

use serde::Serialize;

use crate::models::Candle;

// ── Technical Indicator Calculations ──────────────────────────────────────────

/// Simple Moving Average over the last `period` closes.
#[allow(dead_code)]
fn sma(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period {
        return None;
    }
    let slice = &closes[closes.len() - period..];
    Some(slice.iter().sum::<f64>() / period as f64)
}

/// Exponential Moving Average series. Returns a Vec of the same length as
/// `closes`, with `None` for the warm-up period.
fn ema_series(closes: &[f64], period: usize) -> Vec<Option<f64>> {
    let mut result = vec![None; closes.len()];
    if closes.len() < period {
        return result;
    }
    // Seed with SMA of the first `period` values.
    let seed: f64 = closes[..period].iter().sum::<f64>() / period as f64;
    result[period - 1] = Some(seed);
    let k = 2.0 / (period as f64 + 1.0);
    for i in period..closes.len() {
        let prev = result[i - 1].unwrap_or(seed);
        result[i] = Some(closes[i] * k + prev * (1.0 - k));
    }
    result
}

/// SMA series. Returns the SMA value at each index where enough data exists.
#[allow(dead_code)]
fn sma_series(closes: &[f64], period: usize) -> Vec<Option<f64>> {
    let mut result = vec![None; closes.len()];
    for i in (period - 1)..closes.len() {
        let slice = &closes[i + 1 - period..=i];
        result[i] = Some(slice.iter().sum::<f64>() / period as f64);
    }
    result
}

/// RSI (Wilder's smoothing) over `period` periods.
/// Returns the current RSI value.
fn rsi(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period + 1 {
        return None;
    }
    let mut avg_gain = 0.0;
    let mut avg_loss = 0.0;

    // Initial averages from first `period` changes.
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

    // Wilder smoothing for remaining data.
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

/// Check if volume is increasing: average of last 3 bars > average of prior 10 bars.
fn volume_increasing(volumes: &[u64]) -> bool {
    if volumes.len() < 13 {
        return false;
    }
    let recent: f64 = volumes[volumes.len() - 3..].iter().map(|&v| v as f64).sum::<f64>() / 3.0;
    let prior: f64 = volumes[volumes.len() - 13..volumes.len() - 3]
        .iter()
        .map(|&v| v as f64)
        .sum::<f64>()
        / 10.0;
    prior > 0.0 && recent > prior * 1.1
}

// ── Signal types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SignalDirection {
    Call,
    Put,
}

#[derive(Debug, Clone, Serialize)]
pub struct EmaPullbackSignal {
    pub ticker: String,
    pub direction: SignalDirection,
    /// Current price.
    pub price: f64,
    /// 50-period EMA value (trend filter).
    pub dma_50: f64,
    /// 9-EMA value (momentum confirmation).
    pub ema_9: f64,
    /// 21-EMA value (legacy compat; equal to ema_20 for display).
    pub ema_21: f64,
    /// 20-EMA value (entry trigger).
    pub ema_20: f64,
    /// Current RSI (14-period).
    pub rsi: f64,
    /// Whether volume is increasing.
    pub volume_increasing: bool,
    /// Whether the last candle is a bounce/rejection candle.
    pub candle_confirmed: bool,
    /// EMA50 slope direction (positive = up, negative = down).
    pub dma_slope: f64,
    /// Number of criteria met out of 6.
    pub criteria_met: u8,
    /// Descriptive notes about the signal.
    pub notes: Vec<String>,
    /// Suggested exit condition.
    pub exit_condition: String,
}

// ── Core Analysis ─────────────────────────────────────────────────────────────

/// Analyse a candle history and produce an EMA pullback signal if the setup is valid.
///
/// Requires at least 60 candles (to compute 50-DMA with warm-up).
pub fn analyse(ticker: &str, candles: &[Candle]) -> Option<EmaPullbackSignal> {
    if candles.len() < 60 {
        return None;
    }

    let closes: Vec<f64> = candles.iter().map(|c| c.close).collect();
    let volumes: Vec<u64> = candles.iter().map(|c| c.volume).collect();

    // Compute indicators.
    // EMA50 = trend filter, EMA20 = entry trigger, EMA9 = momentum confirmation
    let ema_50_series = ema_series(&closes, 50);
    let ema_20_series = ema_series(&closes, 20);
    let ema_9_series = ema_series(&closes, 9);

    let n = closes.len();
    let current_price = closes[n - 1];
    let ema_50_now = ema_50_series[n - 1]?;
    let ema_50_prev = ema_50_series[n - 2]?;
    let ema_20_now = ema_20_series[n - 1]?;
    let ema_9_now = ema_9_series[n - 1]?;
    let current_rsi = rsi(&closes, 14)?;
    let vol_increasing = volume_increasing(&volumes);

    let dma_slope = ema_50_now - ema_50_prev;
    let last_candle = &candles[n - 1];

    // Determine direction candidate using EMA50 as trend filter.
    let is_bullish = current_price > ema_50_now;
    let is_bearish = current_price < ema_50_now;

    if !is_bullish && !is_bearish {
        return None;
    }

    let direction = if is_bullish {
        SignalDirection::Call
    } else {
        SignalDirection::Put
    };

    let mut criteria_met: u8 = 0;
    let mut notes = Vec::new();

    match direction {
        SignalDirection::Call => {
            // 1. Price above EMA50 (trend filter)
            criteria_met += 1;
            notes.push("Price above EMA50".to_string());

            // 2. EMA50 sloping up
            if dma_slope > 0.0 {
                criteria_met += 1;
                notes.push(format!("EMA50 sloping up ({:+.2}/day)", dma_slope));
            } else {
                notes.push(format!("EMA50 NOT sloping up ({:+.2}/day)", dma_slope));
            }

            // 3. Pullback to EMA20 (entry trigger for 14-25 DTE)
            let proximity = (current_price - ema_20_now).abs() / current_price;
            if proximity < 0.015 || (last_candle.low <= ema_20_now * 1.005) {
                criteria_met += 1;
                notes.push(format!(
                    "Pullback to EMA20 (price {:.2} near EMA20 {:.2})",
                    current_price, ema_20_now
                ));
            } else {
                notes.push(format!(
                    "Not at EMA20 ({:.1}% away)",
                    proximity * 100.0
                ));
            }

            // 4. Bounce candle (bullish: close > open, low near EMA20)
            let is_bounce = last_candle.close > last_candle.open
                && last_candle.low <= ema_20_now * 1.01;
            if is_bounce {
                criteria_met += 1;
                notes.push("Bounce candle confirmed".to_string());
            } else {
                notes.push("No bounce candle".to_string());
            }

            // 5. RSI > 50
            if current_rsi > 50.0 {
                criteria_met += 1;
                notes.push(format!("RSI {:.1} > 50", current_rsi));
            } else {
                notes.push(format!("RSI {:.1} < 50", current_rsi));
            }

            // 6. Volume increasing
            if vol_increasing {
                criteria_met += 1;
                notes.push("Volume increasing".to_string());
            } else {
                notes.push("Volume not increasing".to_string());
            }
        }
        SignalDirection::Put => {
            // 1. Price below EMA50 (trend filter)
            criteria_met += 1;
            notes.push("Price below EMA50".to_string());

            // 2. EMA50 sloping down
            if dma_slope < 0.0 {
                criteria_met += 1;
                notes.push(format!("EMA50 sloping down ({:+.2}/day)", dma_slope));
            } else {
                notes.push(format!("EMA50 NOT sloping down ({:+.2}/day)", dma_slope));
            }

            // 3. Retrace to EMA20 (entry trigger for 14-25 DTE)
            let proximity = (ema_20_now - current_price).abs() / current_price;
            if proximity < 0.015 || (last_candle.high >= ema_20_now * 0.995) {
                criteria_met += 1;
                notes.push(format!(
                    "Retrace to EMA20 (price {:.2} near EMA20 {:.2})",
                    current_price, ema_20_now
                ));
            } else {
                notes.push(format!(
                    "Not at EMA20 ({:.1}% away)",
                    proximity * 100.0
                ));
            }

            // 4. Rejection candle (bearish: close < open, high near EMA20)
            let is_rejection = last_candle.close < last_candle.open
                && last_candle.high >= ema_20_now * 0.99;
            if is_rejection {
                criteria_met += 1;
                notes.push("Rejection candle confirmed".to_string());
            } else {
                notes.push("No rejection candle".to_string());
            }

            // 5. RSI < 50
            if current_rsi < 50.0 {
                criteria_met += 1;
                notes.push(format!("RSI {:.1} < 50", current_rsi));
            } else {
                notes.push(format!("RSI {:.1} > 50", current_rsi));
            }

            // 6. Volume increasing
            if vol_increasing {
                criteria_met += 1;
                notes.push("Volume increasing".to_string());
            } else {
                notes.push("Volume not increasing".to_string());
            }
        }
    }

    let candle_confirmed = match direction {
        SignalDirection::Call => {
            last_candle.close > last_candle.open
        }
        SignalDirection::Put => {
            last_candle.close < last_candle.open
        }
    };

    let exit_condition = match direction {
        SignalDirection::Call => format!(
            "Exit if price loses EMA20 ({:.2}) or EMA50 ({:.2}) flattens",
            ema_20_now, ema_50_now
        ),
        SignalDirection::Put => format!(
            "Exit if price reclaims EMA20 ({:.2}) or EMA50 ({:.2}) flattens",
            ema_20_now, ema_50_now
        ),
    };

    Some(EmaPullbackSignal {
        ticker: ticker.to_uppercase(),
        direction,
        price: current_price,
        dma_50: ema_50_now,
        ema_9: ema_9_now,
        ema_21: ema_20_now, // backwards compat: ema_21 field carries EMA20 value
        ema_20: ema_20_now,
        rsi: current_rsi,
        volume_increasing: vol_increasing,
        candle_confirmed,
        dma_slope,
        criteria_met,
        notes,
        exit_condition,
    })
}
