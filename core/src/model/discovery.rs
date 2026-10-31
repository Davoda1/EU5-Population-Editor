use super::*;
use walkdir::WalkDir;
fn files(root: &Path) -> Vec<PathBuf> {
    let mut v: Vec<_> = WalkDir::new(root)
        .follow_links(false)
        .max_depth(12)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.into_path())
        .collect();
    v.sort();
    v
}
pub fn load(path: &Path) -> Result<Game> {
    let root = if path.join("game").is_dir() {
        path.join("game")
    } else {
        path.into()
    }
    .canonicalize()
    .context("Game Data: folder does not exist; browse to the installation or game directory")?;
    let all = files(&root);
    ensure!(
        !all.is_empty(),
        "Game Data: selected folder contains no readable files"
    );
    let selection = setup::select(&root, &all)?;
    let setup_paths: BTreeSet<_> = selection.files.iter().cloned().collect();
    let mut sources = BTreeMap::new();
    let mut locations = BTreeMap::new();
    let mut owners = BTreeMap::new();
    let mut defs = Definitions::default();
    let mut names = BTreeMap::new();
    let mut hashes = selection.hashes;
    let mut colors = BTreeMap::new();
    let mut location_kinds = BTreeMap::new();
    let mut classification_source = None;
    let mut classifications_present = false;
    let mut issues = selection.issues;
    let mut ownership_sources = BTreeMap::new();
    let mut map_path = None;
    // Setup files have already been restricted to one active bookmark. Include
    // targets keep their original paths so source-preserving exports override
    // the same files the game reads.
    for path in selection.files.iter().chain(all.iter().filter(|p| {
        !p.strip_prefix(&root)
            .unwrap()
            .components()
            .any(|c| c.as_os_str() == "setup")
    })) {
        let rel = path
            .strip_prefix(&root)?
            .to_string_lossy()
            .replace('\\', "/");
        let ext = path.extension().and_then(|x| x.to_str()).unwrap_or("");
        if ext == "yml" && rel.contains("localization/") && rel.contains("english") {
            match read(path) {
                Ok(s) => names.extend(localization(&s)),
                Err(e) => issues.push(warning(&rel, e.to_string(), "Localized names")),
            };
            continue;
        }
        if ext != "txt" && ext != "map" {
            continue;
        }
        let is_setup = setup_paths.contains(path);
        let relevant = is_setup
            || rel.contains("common/cultures/")
            || rel.contains("common/religions/")
            || rel.contains("common/pop_types/")
            || rel.contains("map_data/named_locations/")
            || rel.ends_with("map_data/default.map");
        if !relevant {
            continue;
        }
        let is_default_map = rel.ends_with("map_data/default.map");
        // A malformed default.map can conceal editing restrictions. Fail the
        // whole load instead of silently treating its locations as ordinary land.
        let optional_map = rel.contains("map_data/") && !is_default_map;
        let s = match read(path) {
            Ok(s) => s,
            Err(e) if optional_map => {
                issues.push(warning(&rel, e.to_string(), "Map"));
                continue;
            }
            Err(e) => return Err(e),
        };
        let ast = match parser::parse(&s) {
            Ok(ast) => ast,
            Err(e) if optional_map => {
                issues.push(warning(
                    &rel,
                    format!("Unsupported map definition: {e}"),
                    "Map",
                ));
                continue;
            }
            Err(e) => {
                return Err(e).with_context(|| {
                    format!("Parse {rel}; unsupported or malformed syntax; no state changed")
                })
            }
        };
        let is_pops = ast.iter().any(|n| {
            n.key.as_deref() == Some("locations")
                && n.children.as_ref().is_some_and(|cs| {
                    cs.iter().any(|c| {
                        c.children.as_ref().is_some_and(|ps| {
                            ps.iter().any(|p| p.key.as_deref() == Some("define_pop"))
                        })
                    })
                })
        });
        if is_setup && is_pops {
            for (key, loc) in
                population::locations(&s).with_context(|| format!("Population setup {rel}"))?
            {
                ensure!(
                    !locations.contains_key(&key),
                    "Population setup {rel}: location {key} occurs in multiple population files; refusing ambiguous include/override semantics"
                );
                locations.insert(key, loc);
            }
            sources.insert(rel.clone(), s.clone());
        }
        if is_setup {
            let parsed = ownership_countries(&ast)
                .with_context(|| format!("Country ownership setup {rel}"))?;
            for (tag, locations) in parsed {
                if let Some(previous) = ownership_sources.insert(tag.clone(), rel.clone()) {
                    anyhow::bail!("Country ownership setup {rel}: {tag} also defines ownership in {previous}; refusing ambiguous include/override semantics");
                }
                for location in locations {
                    owners
                        .entry(location)
                        .or_insert_with(BTreeSet::new)
                        .insert(tag.clone());
                }
            }
        }
        let target = if rel.contains("common/cultures/") {
            Some(&mut defs.culture)
        } else if rel.contains("common/religions/") {
            Some(&mut defs.religion)
        } else if rel.contains("common/pop_types/") {
            Some(&mut defs.kind)
        } else {
            None
        };
        if let Some(target) = target {
            for n in &ast {
                if n.children.is_some() {
                    if let Some(k) = &n.key {
                        target.insert(k.clone());
                    }
                }
            }
        }
        if rel.contains("map_data/named_locations/") {
            for n in &ast {
                if let (Some(k), Some(v)) = (&n.key, &n.atom) {
                    if let Ok(rgb) = u32::from_str_radix(v, 16) {
                        if rgb <= 0xffffff {
                            colors.insert(k.clone(), rgb);
                        }
                    }
                }
            }
        }
        if is_default_map {
            ensure!(
                classification_source.is_none(),
                "Multiple default.map files found; location classifications are ambiguous"
            );
            classification_source = Some(rel.clone());
            let fields = ["sea_zones", "lakes", "impassable_mountains", "non_ownable"];
            fn nested_classification(nodes: &[parser::Node], fields: &[&str]) -> bool {
                nodes.iter().any(|node| {
                    node.key.as_deref().is_some_and(|key| fields.contains(&key))
                        || node
                            .children
                            .as_deref()
                            .is_some_and(|children| nested_classification(children, fields))
                })
            }
            for node in &ast {
                ensure!(
                    !(node.key.is_none() && node.atom.as_deref().is_some_and(|atom| fields.contains(&atom)))
                        && !node.children.as_deref().is_some_and(|children| nested_classification(children, &fields)),
                    "{rel}: location classification lists must be top-level assignments; no state changed"
                );
            }
            for (field, kind) in [
                ("sea_zones", LocationKind::Sea),
                ("lakes", LocationKind::Lake),
                ("impassable_mountains", LocationKind::Impassable),
                ("non_ownable", LocationKind::NonOwnable),
            ] {
                let lists: Vec<_> = ast
                    .iter()
                    .filter(|n| n.key.as_deref() == Some(field))
                    .collect();
                ensure!(
                    lists.len() <= 1,
                    "{rel}: duplicate {field} classification list; no state changed"
                );
                let Some(list) = lists.first() else { continue };
                classifications_present = true;
                ensure!(
                    list.op.as_deref() == Some("=") && list.atom.is_none(),
                    "{rel}: {field} must be a plain location-list block; no state changed"
                );
                for entry in list.block().with_context(|| {
                    format!("{rel}: malformed {field} classification list; no state changed")
                })? {
                    ensure!(
                        entry.key.is_none() && entry.children.is_none(),
                        "{rel}: {field} contains an unsupported location entry; no state changed"
                    );
                    let key = entry.scalar()?;
                    ensure!(
                        !key.is_empty() && !key.chars().any(char::is_whitespace),
                        "{rel}: {field} contains an invalid location key; no state changed"
                    );
                    let current = location_kinds
                        .entry(key.to_owned())
                        .or_insert(LocationKind::Land);
                    if kind.priority() > current.priority() {
                        *current = kind;
                    }
                }
            }
            if let Ok(n) = parser::named(&ast, "provinces") {
                if let Ok(v) = n.scalar() {
                    let candidate = path.parent().unwrap().join(v);
                    if let Ok(c) = candidate.canonicalize() {
                        if c.starts_with(&root) && c.is_file() {
                            map_path = Some(c);
                        } else {
                            issues.push(warning(
                                &rel,
                                "Map reference is outside the game or not a file".into(),
                                "Map",
                            ));
                        }
                    }
                } else {
                    issues.push(warning(
                        &rel,
                        "Unsupported provinces map reference; expected a filename".into(),
                        "Map",
                    ));
                }
            }
        }
        hashes.insert(rel, hash(s.as_bytes()));
    }
    ensure!(!sources.is_empty(),"Game Data: no supported population locations/define_pop structure found under setup. Select the EU5 root or game subdirectory");
    ensure!(
        !owners.is_empty(),
        "Game Data: no country ownership setup found in the selected bookmark; expected countries/TAG/own_* location lists"
    );
    ensure!(!defs.culture.is_empty()&&!defs.religion.is_empty()&&!defs.kind.is_empty(),"Game Data: culture, religion and pop-type definitions are required; select a complete installation");
    if map_path.is_none() {
        map_path = all
            .iter()
            .find(|p| {
                p.file_name().is_some_and(|n| n == "locations.png")
                    && p.to_string_lossy().contains("map_data")
            })
            .cloned()
    }
    if map_path.is_none() || colors.is_empty() {
        issues.push(warning(
            "map_data",
            "Missing map or named-location colors".into(),
            "Map",
        ))
    }
    if !classifications_present {
        issues.push(Issue {
            severity: "warning".into(),
            file: classification_source.unwrap_or_else(|| "map_data/default.map".into()),
            location: None,
            message: "No location classifications found; water and impassable restrictions are unavailable for this game data".into(),
            feature: "Location classification and map colors".into(),
            resolution: "Load matching default.map data to identify restricted locations. Unclassified population locations remain editable".into(),
        });
    }
    if names.is_empty() {
        issues.push(warning(
            "localization/english",
            "English localization unavailable".into(),
            "Localized names",
        ))
    }
    let fingerprint = hash(&serde_json::to_vec(&hashes)?);
    Ok(Game {
        root,
        sources,
        locations,
        owners,
        names,
        defs,
        hashes,
        fingerprint,
        issues,
        colors,
        location_kinds,
        map_path,
    })
}
fn warning(file: &str, message: String, feature: &str) -> Issue {
    Issue{severity:"warning".into(),file:file.into(),location:None,message,feature:feature.into(),resolution:"Check matching game data; optional map/localization issues do not prevent demographic editing".into()}
}
