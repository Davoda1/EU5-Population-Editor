pub mod decimal;
use crate::model::{population as p, Definitions, Pop};
use anyhow::{bail, ensure, Result};
use decimal as d;
use num_traits::Zero;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    Exact {
        tuple: String,
        mode: String,
        value: String,
    },
    Remove {
        tuple: String,
    },
    Add {
        #[serde(rename = "type")]
        pop_type: String,
        culture: String,
        religion: String,
        size: String,
    },
    Scale {
        mode: String,
        value: String,
    },
    Rebalance {
        axis: String,
        weights: BTreeMap<String, String>,
        #[serde(default)]
        advanced: bool,
    },
}
fn target(old: &d::Q, mode: &str, value: &str) -> Result<d::Q> {
    let v = d::parse(value)?;
    if matches!(mode, "set" | "add") {
        ensure!(
            d::is_whole_people(&v),
            "Population inputs must be whole people (increments of 0.001 EU5 source units)"
        );
    }
    let q = match mode {
        "set" => v,
        "add" => old + v,
        "percent" => old * (d::parse("1")? + v / d::parse("100")?),
        "multiply" => old * v,
        _ => bail!("Unknown arithmetic mode"),
    };
    ensure!(
        q >= d::parse("0")?,
        "Result would be negative; draft unchanged"
    );
    if mode == "add" {
        ensure!(
            d::is_whole_people(&q),
            "The existing population contains a fractional person. Use Set exact value to choose a whole-person target before adding or subtracting; draft unchanged"
        );
    }
    Ok(q)
}
pub fn scale(rows: &[Pop], total: &d::Q, precision: usize) -> Result<Vec<Pop>> {
    let sizes = d::allocate(
        total,
        &rows
            .iter()
            .map(|p| d::nonnegative(&p.size))
            .collect::<Result<Vec<_>>>()?,
        precision,
    )?;
    let mut out = rows.to_vec();
    for (p, s) in out.iter_mut().zip(sizes) {
        p.size = s;
    }
    Ok(out)
}
pub fn preview(rows: &[Pop], op: &Operation, defs: &Definitions) -> Result<Vec<Pop>> {
    let mut out = rows.to_vec();
    // Only directly requested edits use the whole-person grid. Generic scaling
    // retains its caller-selected precision for existing-project migration.
    let precision = d::PEOPLE_PRECISION;
    match op {
        Operation::Exact { tuple, mode, value } => {
            let indices: Vec<_> = rows
                .iter()
                .enumerate()
                .filter(|(_, p)| p.tuple() == *tuple)
                .map(|(i, _)| i)
                .collect();
            ensure!(!indices.is_empty(), "Tuple no longer exists");
            let chosen: Vec<_> = indices.iter().map(|i| rows[*i].clone()).collect();
            let old = p::total(&chosen)?;
            let new = target(&old, mode, value)?;
            let weights = if old.is_zero() {
                vec![d::parse("1")?; indices.len()]
            } else {
                chosen
                    .iter()
                    .map(|p| d::nonnegative(&p.size))
                    .collect::<Result<_>>()?
            };
            let sizes = d::allocate(&new, &weights, precision)?;
            for (i, s) in indices.into_iter().zip(sizes) {
                out[i].size = s;
            }
        }
        Operation::Remove { tuple } => {
            ensure!(out.iter().any(|p| p.tuple() == *tuple), "Tuple not found");
            out.retain(|p| p.tuple() != *tuple);
        }
        Operation::Add {
            pop_type,
            culture,
            religion,
            size,
        } => {
            let value = d::nonnegative(size)?;
            ensure!(
                d::is_whole_people(&value),
                "Population inputs must be whole people (increments of 0.001 EU5 source units)"
            );
            let p = Pop {
                kind: pop_type.clone(),
                culture: culture.clone(),
                religion: religion.clone(),
                size: d::format(&value, precision),
                template: String::new(),
            };
            defs.validate(&p)?;
            ensure!(
                !out.iter().any(|x| x.tuple() == p.tuple()),
                "Combination exists; use its exact row editor"
            );
            out.push(p);
        }
        Operation::Scale { mode, value } => {
            let total = target(&p::total(rows)?, mode, value)?;
            out = scale(rows, &total, precision)?;
        }
        Operation::Rebalance {
            axis,
            weights,
            advanced,
        } => {
            ensure!(
                ["culture", "religion", "type"].contains(&axis.as_str()),
                "Invalid rebalance axis"
            );
            ensure!(!weights.is_empty(), "Enter weights");
            for key in weights.keys() {
                ensure!(defs.contains(axis, key), "Unknown {axis}: {key}");
            }
            let groups: Vec<_> = weights.keys().cloned().collect();
            let ws = weights
                .values()
                .map(|s| d::nonnegative(s))
                .collect::<Result<Vec<_>>>()?;
            let old_total = p::total(rows)?;
            ensure!(
                d::is_whole_people(&old_total),
                "The location total contains a fractional person. Use Scale population total → Set exact value to choose a whole-person total before rebalancing; draft unchanged"
            );
            let totals = d::allocate(&old_total, &ws, precision)?;
            out.clear();
            if *advanced {
                // Allocate every complementary bucket independently: its exact total is invariant.
                let mut buckets: BTreeMap<String, Vec<Pop>> = BTreeMap::new();
                for row in rows {
                    let mut neutral = row.clone();
                    neutral.set_field(axis, "_");
                    let key = format!("{}#{}", neutral.tuple(), neutral.unknown()?);
                    buckets.entry(key).or_default().push(row.clone());
                }
                for bucket in buckets.values() {
                    let bucket_total = p::total(bucket)?;
                    ensure!(
                        d::is_whole_people(&bucket_total),
                        "A complementary demographic bucket contains a fractional person. Use Scale population total → Set exact value to normalize this location to whole people before Advanced preservation; draft unchanged"
                    );
                    let allocations = d::allocate(&bucket_total, &ws, precision)?;
                    for (group, size) in groups.iter().zip(allocations) {
                        let mut row = bucket[0].clone();
                        row.set_field(axis, group);
                        row.size = size;
                        out.push(row);
                    }
                }
            } else {
                for (group, total) in groups.iter().zip(totals) {
                    let mut profile: Vec<_> = rows
                        .iter()
                        .filter(|p| p.field(axis) == group)
                        .cloned()
                        .collect();
                    if profile.is_empty() {
                        profile = rows.to_vec();
                    }
                    ensure!(
                        !profile.is_empty(),
                        "Add an initial group before rebalancing an empty location"
                    );
                    for row in &mut profile {
                        row.set_field(axis, group);
                    }
                    let total = d::nonnegative(&total)?;
                    if p::total(&profile)?.is_zero() && !total.is_zero() {
                        // The retained rows have no relative weights after a group
                        // reaches zero. Restore it evenly without replacing its
                        // demographic identities or unknown-field templates.
                        let sizes = d::allocate(
                            &total,
                            &vec![d::parse("1")?; profile.len()],
                            precision,
                        )?;
                        for (row, size) in profile.iter_mut().zip(sizes) {
                            row.size = size;
                        }
                        out.extend(profile);
                    } else {
                        out.extend(scale(&profile, &total, precision)?);
                    }
                }
            }
            ensure!(
                p::total(&out)? == p::total(rows)?,
                "Internal total preservation check failed"
            );
        }
    }
    for row in &out {
        defs.validate(row)?;
        d::nonnegative(&row.size)?;
        row.rendered()?;
    }
    Ok(out)
}
