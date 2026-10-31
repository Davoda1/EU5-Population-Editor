use crate::model::{hash, population as p, Game, LocationKind, Pop};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Write,
    path::Path,
};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    pub baseline: Vec<Pop>,
    pub working: Vec<Pop>,
    pub baseline_nonpop: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub format: String,
    pub format_version: u32,
    pub app_version: String,
    pub title: String,
    pub fingerprint: String,
    pub source_hashes: BTreeMap<String, String>,
    pub changes: BTreeMap<String, Change>,
    pub owners: BTreeMap<String, BTreeSet<String>>,
    pub names: BTreeMap<String, String>,
    pub locations: BTreeSet<String>,
    pub selected_country: String,
    pub selected_location: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    checksum: String,
    project: Project,
}
impl Project {
    pub fn new(g: &Game) -> Self {
        Self {
            format: "eu5-population-project".into(),
            format_version: 1,
            app_version: env!("CARGO_PKG_VERSION").into(),
            title: "Untitled project".into(),
            fingerprint: g.fingerprint.clone(),
            source_hashes: g.hashes.clone(),
            changes: BTreeMap::new(),
            owners: g.owners.clone(),
            names: g
                .owners
                .values()
                .flatten()
                .filter_map(|tag| g.names.get(tag).map(|n| (tag.clone(), n.clone())))
                .collect(),
            locations: g.locations.keys().cloned().collect(),
            selected_country: String::new(),
            selected_location: String::new(),
        }
    }
    pub fn rows<'a>(&'a self, g: &'a Game, key: &str) -> Result<&'a [Pop]> {
        g.ensure_editable(key)?;
        if let Some(c) = self.changes.get(key) {
            Ok(&c.working)
        } else {
            Ok(&g
                .locations
                .get(key)
                .ok_or_else(|| anyhow::anyhow!("Location {key} not found"))?
                .pops)
        }
    }
    pub fn set(&mut self, g: &Game, key: &str, rows: Vec<Pop>) -> Result<()> {
        g.ensure_editable(key)?;
        ensure!(
            self.fingerprint == g.fingerprint,
            "Source mismatch: use Upgrade Project before editing"
        );
        let loc = g
            .locations
            .get(key)
            .ok_or_else(|| anyhow::anyhow!("Missing location {key}"))?;
        for row in &rows {
            g.defs.validate(row)?;
            row.rendered()?;
        }
        if p::canonical(&rows)? == p::canonical(&loc.pops)? {
            self.changes.remove(key);
        } else {
            self.changes.insert(
                key.into(),
                Change {
                    baseline: loc.pops.clone(),
                    working: rows,
                    baseline_nonpop: loc.nonpop.clone(),
                },
            );
        }
        Ok(())
    }
    /// Check every stored edit, including entries not reached through a UI list.
    /// An older snapshot retains its embedded baseline while awaiting migration;
    /// editing/export additionally require matching source fingerprints.
    pub fn validate_locations(&self, g: &Game) -> Result<()> {
        if self.fingerprint != g.fingerprint {
            return Ok(());
        }
        for key in self.changes.keys() {
            ensure!(
                g.kind(key) == LocationKind::Land,
                "Project contains population changes for restricted location {key} ({}). The file and current work were not changed; open a project backup without restricted-location edits",
                g.kind(key).label()
            );
            ensure!(
                g.locations.contains_key(key),
                "Project contains changes for missing location {key}; no project data changed"
            );
        }
        Ok(())
    }
    pub fn save(&self, path: &Path) -> Result<()> {
        let bytes = serde_json::to_vec(self)?;
        let envelope = Envelope {
            checksum: hash(&bytes),
            project: self.clone(),
        };
        atomic(path, &serde_json::to_vec_pretty(&envelope)?)
    }
    pub fn load(path: &Path) -> Result<Self> {
        let bytes =
            std::fs::read(path).with_context(|| format!("Open project {}", path.display()))?;
        ensure!(
            bytes.len() <= 128 * 1024 * 1024,
            "Project exceeds 128 MiB size limit"
        );
        let e: Envelope = serde_json::from_slice(&bytes)
            .context("Invalid/corrupt project; existing Working state was not changed")?;
        ensure!(
            e.checksum == hash(&serde_json::to_vec(&e.project)?),
            "Project checksum mismatch; restore a known-good copy"
        );
        ensure!(
            e.project.format == "eu5-population-project" && e.project.format_version == 1,
            "Unsupported project format/version"
        );
        for change in e.project.changes.values() {
            p::canonical(&change.baseline)?;
            p::canonical(&change.working)?;
            for row in change.baseline.iter().chain(&change.working) {
                row.rendered()?;
            }
        }
        Ok(e.project)
    }
}
pub fn atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    std::fs::create_dir_all(parent)?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent)?;
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|e| e.error).with_context(|| {
        format!(
            "Atomic replace {} failed; original file retained",
            path.display()
        )
    })?;
    #[cfg(unix)]
    std::fs::File::open(parent)?.sync_all()?;
    Ok(())
}
#[derive(Serialize)]
pub struct ImportPlan {
    pub project: Project,
    pub unresolved: BTreeMap<String, serde_json::Value>,
    pub warnings: Vec<String>,
}
pub fn legacy(g: &Game, path: &Path) -> Result<ImportPlan> {
    let j: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)?;
    ensure!(
        j["format"] == "eu5-pop-editor-project" && j["format_version"] == 1,
        "Unsupported legacy project"
    );
    let rows = j["pops"]
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("Legacy pops object missing"))?;
    let mut project = Project::new(g);
    let mut unresolved = BTreeMap::new();
    let mut warnings=vec!["Legacy files cannot prove their original baseline. Confirm that the loaded game snapshot is the old vanilla source before importing.".into()];
    for (key, value) in rows {
        let result = (|| -> Result<()> {
            let pops: Vec<Pop> = serde_json::from_value(value.clone())?;
            let loc = g
                .locations
                .get(key)
                .ok_or_else(|| anyhow::anyhow!("Location absent"))?;
            ensure!(
                loc.pops
                    .iter()
                    .all(|p| p.unknown().is_ok_and(|s| s.is_empty())),
                "Legacy import cannot preserve unknown fields here; manual review required"
            );
            if p::canonical(&pops)? == p::canonical(&loc.pops)? {
                return Ok(());
            }
            project.set(g, key, pops)
        })();
        if let Err(e) = result {
            warnings.push(format!("{key}: {e}"));
            unresolved.insert(key.clone(), value.clone());
        }
    }
    project.selected_country = j["selected_country_tag"].as_str().unwrap_or("").into();
    Ok(ImportPlan {
        project,
        unresolved,
        warnings,
    })
}
/// Convert a source-preserving population mod using the explicitly selected OLD vanilla.
pub fn import_mod(g: &Game, path: &Path) -> Result<ImportPlan> {
    let text = crate::model::read(path)?;
    let modified = p::locations(&text)?;
    let mut project = Project::new(g);
    let mut unresolved = BTreeMap::new();
    let mut warnings=vec!["Load OLD vanilla Game Data before importing a mod. After confirming conversion, choose Upgrade Project and select NEW vanilla.".into()];
    let source = g
        .sources
        .iter()
        .max_by_key(|(_, text)| {
            p::locations(text)
                .map(|ls| ls.keys().filter(|k| modified.contains_key(*k)).count())
                .unwrap_or(0)
        })
        .context("No vanilla population source")?;
    let original_keys = p::locations(source.1)?;
    for key in original_keys.keys() {
        if !modified.contains_key(key) {
            unresolved.insert(key.clone(),serde_json::json!({"reason":"Location missing from mod file; omission cannot be inferred as a removal"}));
        }
    }
    for (key, loc) in modified {
        let result = (|| -> Result<()> {
            let baseline = g
                .locations
                .get(&key)
                .context("Mod introduces a location absent from old vanilla")?;
            ensure!(baseline.nonpop==loc.nonpop,"Mod changes non-population location fields; demographic importer cannot safely import those changes");
            if p::canonical(&baseline.pops)? == p::canonical(&loc.pops)? {
                return Ok(());
            }
            project.set(g, &key, loc.pops.clone())
        })();
        if let Err(e) = result {
            warnings.push(format!("{key}: {e}"));
            unresolved.insert(
                key,
                serde_json::json!({"raw":loc.raw,"reason":e.to_string()}),
            );
        }
    }
    Ok(ImportPlan {
        project,
        unresolved,
        warnings,
    })
}
