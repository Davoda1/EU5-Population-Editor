use crate::{
    editing::decimal as d,
    model::{population as p, Game},
    parser,
    project::Project,
};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    io::Write,
    path::{Path, PathBuf},
};
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Options {
    pub name: String,
    pub id: String,
    pub version: String,
    pub supported_game_version: String,
    pub zip: bool,
    #[serde(default, alias = "acknowledge_unverified_metadata")]
    pub acknowledge_unverified_version: bool,
}
pub fn verified_game_version(version: &str) -> bool {
    let version = version.trim();
    version
        .strip_prefix('v')
        .or_else(|| version.strip_prefix('V'))
        .unwrap_or(version)
        == "1.4.5"
}
pub fn outside_game(game: &Game, path: &Path) -> Result<()> {
    let absolute = if path.is_absolute() {
        path.to_owned()
    } else {
        std::env::current_dir()?.join(path)
    };
    let mut parent = absolute.as_path();
    while !parent.exists() {
        parent = parent
            .parent()
            .ok_or_else(|| anyhow::anyhow!("No existing parent directory"))?;
    }
    let canonical = parent.canonicalize()?;
    ensure!(
        !canonical.starts_with(&game.root),
        "Refusing write inside read-only game installation"
    );
    ensure!(
        !absolute
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir)),
        "Parent-directory components are not accepted in output paths"
    );
    Ok(())
}
pub fn population_files(game: &Game, project: &Project) -> Result<BTreeMap<String, String>> {
    ensure!(
        game.fingerprint == project.fingerprint,
        "Source mismatch: complete migration before exporting"
    );
    project.validate_locations(game)?;
    let mut out = BTreeMap::new();
    for (path, source) in &game.sources {
        let mut edits = vec![];
        for (key, c) in &project.changes {
            if game.source_for(key) == Some(path.as_str()) {
                let loc = &game.locations[key];
                for row in &c.working {
                    game.defs.validate(row)?;
                    row.rendered()?;
                }
                edits.push((loc.start, loc.end, p::render_location(loc, &c.working)?));
            }
        }
        if edits.is_empty() {
            continue;
        }
        let rendered = parser::patch(source, edits)?;
        let parsed = p::locations(&rendered)?;
        for (key, loc) in &parsed {
            if let Some(c) = project.changes.get(key) {
                ensure!(
                    p::canonical(&loc.pops)? == p::canonical(&c.working)?,
                    "Export semantic verification failed for {key}"
                );
            } else {
                ensure!(
                    loc.raw == game.locations[key].raw,
                    "Unrelated location changed: {key}"
                );
            }
        }
        out.insert(path.clone(), rendered);
    }
    Ok(out)
}
pub fn changes(game: &Game, project: &Project) -> Result<serde_json::Value> {
    let mut rows = vec![];
    for (key, c) in &project.changes {
        let a = p::total(&c.baseline)?;
        let b = p::total(&c.working)?;
        let delta = &b - &a;
        let pct = if a == d::parse("0")? {
            None
        } else {
            Some(d::format(&(&delta / &a * d::parse("100")?), 6))
        };
        rows.push(serde_json::json!({"key":key,"name":game.names.get(key).unwrap_or(key),"country":game.owners.get(key),"original_total":d::format(&a,28),"working_total":d::format(&b,28),"delta":d::format(&delta,28),"percentage_delta":pct,"original":c.baseline,"working":c.working}));
    }
    Ok(serde_json::json!(rows))
}
pub fn reports(game: &Game, project: &Project) -> Result<BTreeMap<String, String>> {
    let values = changes(game, project)?;
    let mut markdown=String::from("# Confirmed population changes\n\nAll values use EU5 source size units. Drafts are excluded.\n\n| Location | Country | Original | Working | Delta | Change % |\n|---|---|---:|---:|---:|---:|\n");
    let mut csv = String::from("location,state,type,culture,religion,size\r\n");
    for r in values.as_array().unwrap() {
        let key = r["key"].as_str().unwrap();
        markdown.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} |\n",
            key,
            r["country"],
            r["original_total"],
            r["working_total"],
            r["delta"],
            r["percentage_delta"]
        ));
        for state in ["original", "working"] {
            for row in r[state].as_array().unwrap() {
                let fields = [
                    key,
                    state,
                    row["type"].as_str().unwrap(),
                    row["culture"].as_str().unwrap(),
                    row["religion"].as_str().unwrap(),
                    row["size"].as_str().unwrap(),
                ];
                csv.push_str(
                    &fields
                        .iter()
                        .map(|x| format!("\"{}\"", x.replace('"', "\"\"")))
                        .collect::<Vec<_>>()
                        .join(","),
                );
                csv.push_str("\r\n");
            }
        }
    }
    markdown.push_str(&format!(
        "\n## Exact demographic rows\n\n```json\n{}\n```\n",
        serde_json::to_string_pretty(&values)?
    ));
    Ok(BTreeMap::from([
        (
            "changes.json".into(),
            serde_json::to_string_pretty(&values)?,
        ),
        ("changes.md".into(), markdown),
        ("changes.csv".into(), csv),
    ]))
}
pub fn export(game: &Game, project: &Project, parent: &Path, options: &Options) -> Result<PathBuf> {
    outside_game(game, parent)?;
    game.verify_sources()?;
    ensure!(
        !options.name.trim().is_empty()
            && !options.version.trim().is_empty()
            && !options.supported_game_version.trim().is_empty(),
        "Mod name, version and supported game version are required"
    );
    ensure!(
        verified_game_version(&options.supported_game_version) || options.acknowledge_unverified_version,
        "Compatibility is verified with EU5 v1.4.5. Acknowledge that the selected game version is unverified before exporting"
    );
    ensure!(
        !options.id.is_empty()
            && options.id.len() <= 80
            && options
                .id
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-'),
        "Mod ID must use lowercase ASCII letters, digits and hyphens"
    );
    let files = population_files(game, project)?;
    ensure!(!files.is_empty(), "No confirmed modifications to export");
    std::fs::create_dir_all(parent)?;
    let dest = parent.join(format!("{}-export", options.id));
    ensure!(
        !dest.exists(),
        "Export destination already exists: {}; choose another ID or directory",
        dest.display()
    );
    let temp = tempfile::Builder::new()
        .prefix(".eu5-export-")
        .tempdir_in(parent)?;
    let root = temp.path().join(&options.id);
    std::fs::create_dir_all(root.join(".metadata"))?;
    for (path, bytes) in files {
        let target = root.join(&path);
        std::fs::create_dir_all(target.parent().unwrap())?;
        std::fs::write(&target, bytes)?;
    }
    let metadata = serde_json::json!({"name":options.name,"id":options.id,"version":options.version,"supported_game_version":options.supported_game_version,"short_description":"Confirmed population edits. Unofficial third-party tool; not affiliated with or endorsed by Paradox Interactive.","tags":["Population"],"relationships":[],"game_custom_data":{}});
    std::fs::write(
        root.join(".metadata/metadata.json"),
        serde_json::to_vec_pretty(&metadata)?,
    )?;
    let actual: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join(".metadata/metadata.json"))?)?;
    ensure!(actual == metadata, "Metadata write verification failed");
    for (name, text) in reports(game, project)? {
        std::fs::write(root.join(name), text)?;
    }
    if options.zip {
        let file = std::fs::File::create(temp.path().join(format!("{}.zip", options.id)))?;
        let mut zip = zip::ZipWriter::new(file);
        let opts = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let mut entries: Vec<_> = walkdir::WalkDir::new(&root)
            .into_iter()
            .collect::<Result<Vec<_>, _>>()?;
        entries.sort_by_key(|e| e.path().to_owned());
        for entry in entries {
            if entry.file_type().is_file() {
                let name = entry
                    .path()
                    .strip_prefix(temp.path())?
                    .to_string_lossy()
                    .replace('\\', "/");
                zip.start_file(name, opts)?;
                zip.write_all(&std::fs::read(entry.path())?)?;
            }
        }
        zip.finish()?.sync_all()?;
    }
    // Re-read population output from disk before publishing the staged directory.
    for (path, expected) in population_files(game, project)? {
        let actual = std::fs::read_to_string(root.join(path))?;
        ensure!(actual == expected, "Population write verification failed");
        p::locations(&actual)?;
    }
    std::fs::rename(temp.path(), &dest)
        .context("Publish staged export failed; no game files changed")?;
    Ok(dest)
}
