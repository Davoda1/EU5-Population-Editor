use crate::{
    editing::decimal as d,
    parser::{self, Node},
};
use anyhow::{ensure, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Pop {
    #[serde(rename = "type")]
    pub kind: String,
    pub culture: String,
    pub religion: String,
    pub size: String,
    #[serde(default)]
    pub template: String,
}
impl Pop {
    pub fn tuple(&self) -> String {
        format!("{}|{}|{}", self.kind, self.culture, self.religion)
    }
    pub fn field(&self, axis: &str) -> &str {
        match axis {
            "culture" => &self.culture,
            "religion" => &self.religion,
            _ => &self.kind,
        }
    }
    pub fn set_field(&mut self, axis: &str, value: &str) {
        match axis {
            "culture" => self.culture = value.into(),
            "religion" => self.religion = value.into(),
            _ => self.kind = value.into(),
        }
    }
    pub fn unknown(&self) -> Result<String> {
        if self.template.is_empty() {
            return Ok(String::new());
        }
        let nodes = parser::parse(&self.template)?;
        let n = parser::named(&nodes, "define_pop")?;
        let fields: Vec<_> = n
            .block()?
            .iter()
            .filter(|x| {
                !matches!(
                    x.key.as_deref(),
                    Some("size" | "culture" | "religion" | "type")
                )
            })
            .collect();
        Ok(parser::canonical_fields(&fields))
    }
    pub fn rendered(&self) -> Result<String> {
        for s in [&self.kind, &self.culture, &self.religion] {
            ensure!(
                !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_'),
                "Invalid demographic identifier {s}"
            );
        }
        d::nonnegative(&self.size)?;
        if self.template.is_empty() {
            return Ok(format!(
                "define_pop = {{ type = {} size = {} culture = {} religion = {} }}",
                self.kind, self.size, self.culture, self.religion
            ));
        }
        let nodes = parser::parse(&self.template)?;
        let n = parser::named(&nodes, "define_pop")?;
        let mut edits = vec![];
        for (key, value) in [
            ("size", &self.size),
            ("culture", &self.culture),
            ("religion", &self.religion),
            ("type", &self.kind),
        ] {
            let f = n.field(key)?;
            if f.scalar()? != value {
                edits.push((f.value_start, f.value_end, value.clone()));
            }
        }
        parser::patch(&self.template, edits)
    }
}
#[derive(Clone, Debug)]
pub struct Location {
    pub start: usize,
    pub end: usize,
    pub raw: String,
    pub pops: Vec<Pop>,
    pub nonpop: String,
}
pub fn pops(node: &Node, source: &str) -> Result<Vec<Pop>> {
    node.block()?
        .iter()
        .filter(|n| n.key.as_deref() == Some("define_pop"))
        .map(|n| {
            let p = Pop {
                kind: n.field("type")?.scalar()?.into(),
                culture: n.field("culture")?.scalar()?.into(),
                religion: n.field("religion")?.scalar()?.into(),
                size: n.field("size")?.scalar()?.into(),
                template: source[n.start..n.end].into(),
            };
            d::nonnegative(&p.size)?;
            Ok(p)
        })
        .collect()
}
pub fn locations(source: &str) -> Result<BTreeMap<String, Location>> {
    let nodes = parser::parse(source)?;
    let root = parser::named(&nodes, "locations")?;
    let mut out = BTreeMap::new();
    for n in root.block()? {
        let key = n
            .key
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Bare value in locations"))?;
        let rows = pops(n, source)?;
        let extras: Vec<_> = n
            .block()?
            .iter()
            .filter(|n| n.key.as_deref() != Some("define_pop"))
            .collect();
        ensure!(
            !out.contains_key(key),
            "Duplicate location {key}; ambiguous output would be unsafe"
        );
        out.insert(
            key.clone(),
            Location {
                start: n.start,
                end: n.end,
                raw: source[n.start..n.end].into(),
                pops: rows,
                nonpop: parser::canonical_fields(&extras),
            },
        );
    }
    ensure!(!out.is_empty(), "No locations in population source");
    Ok(out)
}
pub fn canonical(rows: &[Pop]) -> Result<BTreeMap<String, d::Q>> {
    let mut out = BTreeMap::new();
    for p in rows {
        let key = format!("{}#{}", p.tuple(), p.unknown()?);
        *out.entry(key).or_insert_with(|| d::parse("0").unwrap()) += d::nonnegative(&p.size)?;
    }
    Ok(out)
}
/// Compare demographic meaning without losing an explicit whole-person repair.
/// Aggregate totals alone cannot distinguish fractional source rows from their
/// normalized allocation (for example, 0.0004 + 0.0006 from 0.001 + 0).
/// Formatting, row order and harmless regrouping of whole people still compare
/// equal, while existing fractional rows remain exact until deliberately edited.
pub fn equivalent(left: &[Pop], right: &[Pop]) -> Result<bool> {
    if canonical(left)? != canonical(right)? {
        return Ok(false);
    }
    let fractional_rows = |rows: &[Pop]| -> Result<BTreeMap<(String, d::Q), usize>> {
        let mut result = BTreeMap::new();
        for row in rows {
            let size = d::nonnegative(&row.size)?;
            if !d::is_whole_people(&size) {
                let key = format!("{}#{}", row.tuple(), row.unknown()?);
                *result.entry((key, size)).or_insert(0) += 1;
            }
        }
        Ok(result)
    };
    Ok(fractional_rows(left)? == fractional_rows(right)?)
}
pub fn total(rows: &[Pop]) -> Result<d::Q> {
    d::sum(rows.iter().map(|p| p.size.as_str()))
}
pub fn precision(rows: &[Pop]) -> usize {
    rows.iter()
        .map(|p| d::precision(&p.size))
        .max()
        .unwrap_or(3)
        .max(3)
}
pub fn render_location(loc: &Location, rows: &[Pop]) -> Result<String> {
    let nodes = parser::parse(&loc.raw)?;
    let root = &nodes[0];
    let spans: Vec<_> = root
        .block()?
        .iter()
        .filter(|n| n.key.as_deref() == Some("define_pop"))
        .collect();
    let nl = if loc.raw.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut edits = vec![];
    for (i, n) in spans.iter().enumerate() {
        edits.push((
            n.start,
            n.end,
            if i < rows.len() {
                rows[i].rendered()?
            } else {
                String::new()
            },
        ));
    }
    if rows.len() > spans.len() {
        let extra = rows[spans.len()..]
            .iter()
            .map(Pop::rendered)
            .collect::<Result<Vec<_>>>()?
            .join(&format!("{nl}\t"));
        edits.push((root.end - 1, root.end - 1, format!("{nl}\t{extra}{nl}")));
    }
    parser::patch(&loc.raw, edits)
}
