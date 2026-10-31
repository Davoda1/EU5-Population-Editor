pub mod discovery;
pub mod population;
mod setup;
use crate::parser;
use anyhow::{ensure, Context, Result};
pub use population::{Location, Pop};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
};
/// Explicit map classifications; ownership and population totals never imply a kind.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LocationKind {
    #[default]
    Land,
    Sea,
    Lake,
    Impassable,
    NonOwnable,
}
impl LocationKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Land => "Land",
            Self::Sea => "Sea zone",
            Self::Lake => "Lake",
            Self::Impassable => "Impassable terrain",
            Self::NonOwnable => "Non-ownable corridor",
        }
    }
    /// Water wins over blocked land when the game lists a key in both categories.
    pub fn priority(self) -> u8 {
        match self {
            Self::Land => 0,
            Self::NonOwnable => 1,
            Self::Impassable => 2,
            Self::Lake => 3,
            Self::Sea => 4,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Issue {
    pub severity: String,
    pub file: String,
    pub location: Option<String>,
    pub message: String,
    pub feature: String,
    pub resolution: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct Definitions {
    pub culture: BTreeSet<String>,
    pub religion: BTreeSet<String>,
    #[serde(rename = "type")]
    pub kind: BTreeSet<String>,
}
impl Definitions {
    pub fn contains(&self, axis: &str, v: &str) -> bool {
        match axis {
            "culture" => self.culture.contains(v),
            "religion" => self.religion.contains(v),
            "type" => self.kind.contains(v),
            _ => false,
        }
    }
    pub fn validate(&self, p: &Pop) -> Result<()> {
        for (axis, value) in [
            ("culture", &p.culture),
            ("religion", &p.religion),
            ("type", &p.kind),
        ] {
            ensure!(
                self.contains(axis, value),
                "Unknown {axis} '{value}'; load matching current definitions before applying"
            );
        }
        Ok(())
    }
}
pub struct Game {
    pub root: PathBuf,
    pub sources: BTreeMap<String, String>,
    pub locations: BTreeMap<String, Location>,
    pub owners: BTreeMap<String, BTreeSet<String>>,
    pub names: BTreeMap<String, String>,
    pub defs: Definitions,
    pub hashes: BTreeMap<String, String>,
    pub fingerprint: String,
    pub issues: Vec<Issue>,
    pub colors: BTreeMap<String, u32>,
    pub location_kinds: BTreeMap<String, LocationKind>,
    pub map_path: Option<PathBuf>,
}
pub fn hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(bytes))
}
pub fn read(path: &Path) -> Result<String> {
    std::fs::read_to_string(path).with_context(|| {
        format!(
            "Read UTF-8 {}. Check encoding and file permissions; no project data changed",
            path.display()
        )
    })
}
pub fn parse_countries(s: &str) -> Result<BTreeMap<String, BTreeSet<String>>> {
    let n = parser::parse(s)?;
    let mut out: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (tag, locations) in ownership_countries(&n)? {
        for location in locations {
            out.entry(location).or_default().insert(tag.clone());
        }
    }
    ensure!(!out.is_empty(), "No supported country ownership data found");
    Ok(out)
}

/// Country setup also contains AI personalities and area preferences. Those
/// documents are not ownership sources merely because they contain countries.
fn ownership_countries(nodes: &[parser::Node]) -> Result<BTreeMap<String, BTreeSet<String>>> {
    fn ownership_fields(node: &parser::Node) -> usize {
        usize::from(node.key.as_deref().is_some_and(|k| k.starts_with("own_")))
            + node
                .children
                .as_ref()
                .map_or(0, |cs| cs.iter().map(ownership_fields).sum())
    }
    let country_nodes: Vec<_> = nodes
        .iter()
        .filter(|n| n.key.as_deref() == Some("countries"))
        .collect();
    let expected_fields: usize = country_nodes.iter().map(|n| ownership_fields(n)).sum();
    if expected_fields == 0 {
        return Ok(BTreeMap::new());
    }
    let outer = parser::named(nodes, "countries")?;
    let inner = if outer
        .block()?
        .iter()
        .any(|n| n.key.as_deref() == Some("countries"))
    {
        parser::named(outer.block()?, "countries")?
    } else {
        outer
    };
    let mut out: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut parsed_fields = 0;
    for country in inner.block()? {
        let Some(tag) = &country.key else { continue };
        if country.children.is_none() {
            continue;
        }
        for group in country.block()? {
            if !group.key.as_deref().unwrap_or("").starts_with("own_") {
                continue;
            }
            parsed_fields += 1;
            let list = group.block().with_context(|| {
                format!(
                    "Ownership list {} in {tag} must be a block",
                    group.key.as_deref().unwrap()
                )
            })?;
            let locations = out.entry(tag.clone()).or_default();
            for loc in list {
                ensure!(
                    loc.key.is_none() && loc.children.is_none(),
                    "Unsupported ownership list in {tag}"
                );
                locations.insert(loc.scalar()?.into());
            }
        }
    }
    ensure!(
        !out.is_empty() && parsed_fields == expected_fields,
        "Unsupported country ownership structure; expected countries/TAG/own_* lists"
    );
    Ok(out)
}
pub fn localization(s: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for line in s.trim_start_matches('\u{feff}').lines() {
        let l = line.trim();
        if l.starts_with('#') {
            continue;
        }
        let Some((key, val)) = l.split_once(':') else {
            continue;
        };
        let val = val.trim_start_matches(|c: char| c.is_ascii_digit() || c.is_whitespace());
        if !val.starts_with('"') {
            continue;
        }
        let mut text = String::new();
        let mut escaped = false;
        let mut closed = false;
        for c in val[1..].chars() {
            if escaped {
                text.push(c);
                escaped = false
            } else if c == '\\' {
                escaped = true
            } else if c == '"' {
                closed = true;
                break;
            } else {
                text.push(c)
            }
        }
        if closed {
            out.insert(key.to_owned(), text.clone());
            if let Some(k) = key.strip_suffix("_province") {
                out.entry(k.into()).or_insert(text);
            }
        }
    }
    out
}
impl Game {
    pub fn load(path: &Path) -> Result<Self> {
        discovery::load(path)
    }
    pub fn kind(&self, key: &str) -> LocationKind {
        self.location_kinds.get(key).copied().unwrap_or_default()
    }
    pub fn is_editable(&self, key: &str) -> bool {
        self.locations.contains_key(key) && self.kind(key) == LocationKind::Land
    }
    pub fn ensure_editable(&self, key: &str) -> Result<()> {
        ensure!(
            self.kind(key) == LocationKind::Land,
            "Location {key} is {} and cannot be edited for population; no changes were applied",
            self.kind(key).label().to_lowercase()
        );
        ensure!(
            self.locations.contains_key(key),
            "Location not found: {key}"
        );
        Ok(())
    }
    pub fn verify_sources(&self) -> Result<()> {
        for (path, expected) in &self.hashes {
            let actual = hash(
                &std::fs::read(self.root.join(path))
                    .with_context(|| format!("Source file unavailable: {path}"))?,
            );
            ensure!(&actual==expected,"Game source changed since loading: {path}. Reload matching Game Data or migrate before exporting; no output committed");
        }
        Ok(())
    }

    pub fn source_for(&self, key: &str) -> Option<&str> {
        self.sources.iter().find_map(|(path, text)| {
            self.locations
                .get(key)
                .filter(|l| text.get(l.start..l.end) == Some(l.raw.as_str()))
                .map(|_| path.as_str())
        })
    }
    pub fn validate(&self) -> Vec<Issue> {
        let mut issues = self.issues.clone();
        for (key, loc) in &self.locations {
            for p in &loc.pops {
                for (axis, value) in [
                    ("culture", &p.culture),
                    ("religion", &p.religion),
                    ("type", &p.kind),
                ] {
                    if !self.defs.contains(axis, value) {
                        issues.push(Issue {
                            severity: "warning".into(),
                            file: self.source_for(key).unwrap_or("population").into(),
                            location: Some(key.clone()),
                            message: format!("Unknown {axis}: {value}"),
                            feature: "Applying/exporting edits in this location".into(),
                            resolution: "Load matching complete game definitions".into(),
                        })
                    }
                }
            }
        }
        for key in self.owners.keys() {
            if !self.locations.contains_key(key) {
                issues.push(Issue{severity:"warning".into(),file:"country setup".into(),location:Some(key.clone()),message:"Owned location has no population block".into(),feature:"Location editing".into(),resolution:"Verify matching setup files; empty/uninhabitable locations may be intentional".into()})
            }
        }
        if !self.colors.is_empty() {
            let mut by_rgb: BTreeMap<u32, Vec<&String>> = BTreeMap::new();
            for (key, rgb) in &self.colors {
                by_rgb.entry(*rgb).or_default().push(key);
            }
            for (rgb, keys) in by_rgb {
                if keys.len() > 1 {
                    issues.push(Issue{severity:"warning".into(),file:"map_data/named_locations".into(),location:None,message:format!("Shared RGB {rgb:06x}: {}",keys.into_iter().map(|s|s.as_str()).collect::<Vec<_>>().join(", ")),feature:"Map hit testing and highlighting".into(),resolution:"Verify matching map/definitions; ambiguous clicks will not select a guessed location".into()});
                }
            }
            for (key, loc) in &self.locations {
                if !loc.pops.is_empty() && !self.colors.contains_key(key) {
                    issues.push(Issue {
                        severity: "warning".into(),
                        file: "map_data/named_locations".into(),
                        location: Some(key.clone()),
                        message: "Population location has no named map color".into(),
                        feature: "Map positioning".into(),
                        resolution:
                            "Load matching map definitions; demographic editing remains available"
                                .into(),
                    });
                }
            }
        }
        issues
    }
}
