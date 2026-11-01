use crate::{
    editing::{self, decimal as d},
    export, map, migration,
    model::{population as p, Game, Pop},
    project::{self, Project},
};
use anyhow::{bail, ensure, Context, Result};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::{BufRead, Read, Write},
    path::{Path, PathBuf},
};
pub struct Session {
    pub game: Option<Game>,
    pub project: Option<Project>,
    drafts: BTreeMap<String, (u64, Vec<Pop>)>,
    sequence: u64,
    undo: Vec<Project>,
    redo: Vec<Project>,
    plan: Option<migration::Plan>,
    next_game: Option<Game>,
    import: Option<project::ImportPlan>,
    map: Option<map::Map>,
    saved_hash: String,
}
impl Default for Session {
    fn default() -> Self {
        Self {
            game: None,
            project: None,
            drafts: BTreeMap::new(),
            sequence: 0,
            undo: vec![],
            redo: vec![],
            plan: None,
            next_game: None,
            import: None,
            map: None,
            saved_hash: String::new(),
        }
    }
}
fn s<'a>(v: &'a Value, k: &str) -> Result<&'a str> {
    v[k].as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing string parameter: {k}"))
}
impl Session {
    fn game(&self) -> Result<&Game> {
        self.game
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Select Game Data first"))
    }
    fn project(&self) -> Result<&Project> {
        self.project
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Create or open a project first"))
    }
    fn push(&mut self) {
        if let Some(p) = &self.project {
            self.undo.push(p.clone());
            if self.undo.len() > 100 {
                self.undo.remove(0);
            }
        }
        self.redo.clear();
    }
    fn clear_transient(&mut self) {
        self.drafts.clear();
        self.undo.clear();
        self.redo.clear();
        self.plan = None;
        self.next_game = None;
        self.import = None;
    }
    fn state_hash(&self) -> Result<String> {
        Ok(crate::model::hash(&serde_json::to_vec(self.project()?)?))
    }
    fn status(&self) -> Result<Value> {
        let g = self.game()?;
        let p = self.project()?;
        let mut countries: BTreeMap<String, usize> = BTreeMap::new();
        for (key, tags) in &g.owners {
            if !g.is_editable(key) {
                continue;
            }
            for tag in tags {
                *countries.entry(tag.clone()).or_default() += 1;
            }
        }
        Ok(
            json!({"fingerprint":g.fingerprint,"compatible":g.fingerprint==p.fingerprint,"dirty":self.state_hash()?!=self.saved_hash,"modified":p.changes.len(),"drafts":self.drafts.len(),"undo":!self.undo.is_empty(),"redo":!self.redo.is_empty(),"countries":countries.iter().map(|(tag,count)|json!({"tag":tag,"name":g.names.get(tag).unwrap_or(tag),"count":count})).collect::<Vec<_>>(),"definitions":g.defs,"map_available":g.map_path.is_some()&&!g.colors.is_empty(),"map_indexed":self.map.is_some(),"selected_country":p.selected_country,"selected_location":p.selected_location}),
        )
    }
    fn location(&self, key: &str) -> Result<Value> {
        let g = self.game()?;
        g.ensure_editable(key)?;
        let project = self.project()?;
        let loc = g
            .locations
            .get(key)
            .ok_or_else(|| anyhow::anyhow!("Location not found: {key}"))?;
        let working = project.rows(g, key)?;
        let draft = self.drafts.get(key);
        let original = project
            .changes
            .get(key)
            .map(|c| c.baseline.as_slice())
            .unwrap_or(&loc.pops);
        let fractional_people = |rows: &[Pop]| -> Result<bool> {
            for row in rows {
                if !d::is_whole_people(&d::nonnegative(&row.size)?) {
                    return Ok(true);
                }
            }
            Ok(false)
        };
        let original_fractional_people = fractional_people(original)?;
        let working_fractional_people = fractional_people(working)?;
        let draft_fractional_people = draft.map(|(_, rows)| fractional_people(rows))
            .transpose()?.unwrap_or(false);
        let rows = |ps: &[Pop]| -> Result<Value> {
            let mut result: BTreeMap<String, Value> = BTreeMap::new();
            let mut sizes: BTreeMap<String, d::Q> = BTreeMap::new();
            for p in ps {
                sizes
                    .entry(p.tuple())
                    .and_modify(|s| *s += d::nonnegative(&p.size).unwrap())
                    .or_insert(d::nonnegative(&p.size)?);
                result
                    .entry(p.tuple())
                    .or_insert(json!({"type":p.kind,"culture":p.culture,"religion":p.religion}));
            }
            for (k, v) in &mut result {
                v["size"] = json!(d::format(&sizes[k], 28));
            }
            Ok(json!(result))
        };
        Ok(
            json!({"key":key,"name":g.names.get(key).unwrap_or(&key.to_owned()),"owners":g.owners.get(key),"original":rows(original)?,"working":rows(working)?,"draft":draft.map(|(_,r)|rows(r)).transpose()?,"original_total":d::format(&p::total(original)?,28),"working_total":d::format(&p::total(working)?,28),"draft_total":draft.map(|(_,r)|p::total(r).map(|t|d::format(&t,28))).transpose()?,"draft_token":draft.map(|(token,_)|token),"original_fractional_people":original_fractional_people,"working_fractional_people":working_fractional_people,"draft_fractional_people":draft_fractional_people,"region":self.map.as_ref().and_then(|m|m.region(key)),"map_dimensions":self.map.as_ref().map(|m|[m.index.width,m.index.height])}),
        )
    }
    pub fn request(
        &mut self,
        method: &str,
        args: Value,
        mut progress: impl FnMut(Value),
    ) -> Result<Value> {
        match method {
            "load_game" => {
                let game = Game::load(Path::new(s(&args, "path")?))?;
                self.game = Some(game);
                self.project = Some(Project::new(self.game()?));
                self.clear_transient();
                self.map = None;
                self.saved_hash = self.state_hash()?;
                self.status()
            }
            "new_project" => {
                self.project = Some(Project::new(self.game()?));
                self.clear_transient();
                self.saved_hash = self.state_hash()?;
                self.status()
            }
            "status" => self.status(),
            "select" => {
                let country = s(&args, "country")?.to_owned();
                let location = s(&args, "location")?.to_owned();
                if !location.is_empty() {
                    self.game()?.ensure_editable(&location)?;
                }
                let p = self.project.as_mut().context("No project")?;
                p.selected_country = country;
                p.selected_location = location;
                Ok(json!(true))
            }
            "locations" => {
                let g = self.game()?;
                let project = self.project()?;
                let tag = args["country"].as_str().unwrap_or("");
                let search = args["search"].as_str().unwrap_or("").to_lowercase();
                let mode = args["mode"].as_str().unwrap_or("all");
                let offset = args["offset"].as_u64().unwrap_or(0) as usize;
                let limit = args["limit"].as_u64().unwrap_or(100).min(300) as usize;
                let all: Vec<_> = g
                    .locations
                    .keys()
                    .filter(|key| g.is_editable(key))
                    .filter(|key| {
                        tag.is_empty() || g.owners.get(*key).is_some_and(|ts| ts.contains(tag))
                    })
                    .filter(|key| {
                        search.is_empty()
                            || key.contains(&search)
                            || g.names
                                .get(*key)
                                .is_some_and(|n| n.to_lowercase().contains(&search))
                    })
                    .filter(|key| mode != "modified" || project.changes.contains_key(*key))
                    .filter(|key| {
                        mode != "warnings"
                            || g.locations[*key]
                                .pops
                                .iter()
                                .any(|p| g.defs.validate(p).is_err())
                            || !g.colors.contains_key(*key)
                    })
                    .collect();
                Ok(
                    json!({"total":all.len(),"items":all.into_iter().skip(offset).take(limit).map(|key|json!({"key":key,"name":g.names.get(key).unwrap_or(key),"modified":project.changes.contains_key(key),"draft":self.drafts.contains_key(key)})).collect::<Vec<_>>()}),
                )
            }
            "location" => self.location(s(&args, "key")?),
            "preview" => {
                let key = s(&args, "key")?.to_owned();
                let op: editing::Operation = serde_json::from_value(args["operation"].clone())?;
                let g = self.game()?;
                g.ensure_editable(&key)?;
                let project = self.project()?;
                ensure!(
                    project.fingerprint == g.fingerprint,
                    "Source mismatch: upgrade first"
                );
                let rows = editing::preview(project.rows(g, &key)?, &op, &g.defs)?;
                self.sequence += 1;
                self.drafts.insert(key.clone(), (self.sequence, rows));
                self.location(&key)
            }
            "discard" => {
                let key = s(&args, "key")?;
                self.game()?.ensure_editable(key)?;
                self.drafts.remove(key);
                self.location(key)
            }
            "apply" => {
                let key = s(&args, "key")?.to_owned();
                self.game()?.ensure_editable(&key)?;
                let (token, rows) = self.drafts.get(&key).context("No pending draft")?.clone();
                ensure!(
                    Some(token) == args["token"].as_u64(),
                    "Draft preview changed; review the latest proposal before Apply"
                );
                let mut next = self.project()?.clone();
                next.set(self.game()?, &key, rows)?;
                next.validate_locations(self.game()?)?;
                self.push();
                self.project = Some(next);
                self.drafts.remove(&key);
                self.location(&key)
            }
            "undo" | "redo" => {
                ensure!(
                    self.drafts.is_empty(),
                    "Apply or discard pending drafts before undo/redo"
                );
                let current = self.project()?.clone();
                let next = if method == "undo" {
                    self.undo.last()
                } else {
                    self.redo.last()
                }
                .context("No history available")?;
                next.validate_locations(self.game()?)?;
                let next = next.clone();
                if method == "undo" {
                    self.undo.pop();
                    self.redo.push(current)
                } else {
                    self.redo.pop();
                    self.undo.push(current)
                }
                self.project = Some(next);
                self.status()
            }
            "save" => {
                let path = Path::new(s(&args, "path")?);
                export::outside_game(self.game()?, path)?;
                self.project()?.validate_locations(self.game()?)?;
                self.project()?.save(path)?;
                self.saved_hash = self.state_hash()?;
                self.status()
            }
            "open" => {
                let mut p = Project::load(Path::new(s(&args, "path")?))?;
                p.validate_locations(self.game()?)?;
                if !self.game()?.is_editable(&p.selected_location) {
                    p.selected_location.clear();
                }
                self.project = Some(p);
                self.clear_transient();
                self.saved_hash = self.state_hash()?;
                self.status()
            }
            "validate" => {
                let mut issues = self.game()?.validate();
                if let Err(error) = self.project()?.validate_locations(self.game()?) {
                    issues.push(crate::model::Issue {
                        severity: "error".into(),
                        file: "project".into(),
                        location: None,
                        message: error.to_string(),
                        feature: "Population editing, saving and export".into(),
                        resolution: "Open a project backup without restricted-location edits. Projects from older game snapshots can be migrated by explicitly keeping new vanilla".into(),
                    });
                }
                if self.project()?.fingerprint != self.game()?.fingerprint {
                    issues.push(crate::model::Issue {
                        severity: "error".into(),
                        file: "project".into(),
                        location: None,
                        message: "Project/source fingerprint mismatch".into(),
                        feature: "Editing and export".into(),
                        resolution: "Use Upgrade Project with the intended new game data".into(),
                    })
                }
                Ok(
                    json!({"state":if issues.iter().any(|i|i.severity=="error"){"Action required"}else if issues.is_empty(){"Ready"}else{"Ready with warnings"},"issues":issues}),
                )
            }
            "export" => {
                let options: export::Options = serde_json::from_value(args["options"].clone())?;
                let path = export::export(
                    self.game()?,
                    self.project()?,
                    Path::new(s(&args, "path")?),
                    &options,
                )?;
                Ok(json!({"path":path,"working_only":true}))
            }
            "change_report" => {
                let path = Path::new(s(&args, "path")?);
                export::outside_game(self.game()?, path)?;
                let format = s(&args, "format")?;
                let reports = export::reports(self.game()?, self.project()?)?;
                let content = reports
                    .get(&format!("changes.{format}"))
                    .context("Unsupported report format")?;
                project::atomic(path, content.as_bytes())?;
                Ok(json!(true))
            }
            "import_mod_plan" => {
                let plan = project::import_mod(self.game()?, Path::new(s(&args, "path")?))?;
                let result = serde_json::to_value(&plan)?;
                self.import = Some(plan);
                Ok(result)
            }
            "legacy_plan" => {
                let plan = project::legacy(self.game()?, Path::new(s(&args, "path")?))?;
                let result = serde_json::to_value(&plan)?;
                self.import = Some(plan);
                Ok(result)
            }
            "legacy_commit" => {
                let plan = self.import.as_ref().context("No legacy import plan")?;
                ensure!(
                    args["confirm_baseline"] == true,
                    "Confirm the correct old vanilla baseline"
                );
                ensure!(plan.unresolved.is_empty(),"Legacy import has unresolved data; no edits discarded. Correct the source/legacy data and build another plan");
                let project = plan.project.clone();
                project.validate_locations(self.game()?)?;
                self.push();
                self.project = Some(project);
                self.drafts.clear();
                self.import = None;
                self.status()
            }
            "upgrade_plan" => {
                let game = Game::load(Path::new(s(&args, "path")?))?;
                let plan = migration::propose(self.project()?, &game)?;
                let result = serde_json::to_value(&plan)?;
                self.next_game = Some(game);
                self.plan = Some(plan);
                Ok(result)
            }
            "upgrade_resolve" => {
                let plan = self.plan.as_mut().context("No migration plan")?;
                migration::resolve(plan, s(&args, "key")?, s(&args, "choice")?)?;
                Ok(serde_json::to_value(plan)?)
            }
            "upgrade_acknowledge" => {
                let plan = self.plan.as_mut().context("No migration plan")?;
                plan.acknowledged_topology = args["acknowledge"] == true;
                let mappings: BTreeMap<String, String> =
                    serde_json::from_value(args["mappings"].clone())?;
                for (old, new) in &mappings {
                    ensure!(
                        plan.tag_candidates
                            .iter()
                            .any(|c| c.old_tag == *old && c.candidates.iter().any(|v| v.0 == *new)),
                        "Tag mapping was not a proposed candidate"
                    );
                }
                plan.confirmed_tag_mappings = mappings;
                Ok(serde_json::to_value(plan)?)
            }
            "upgrade_commit" => {
                ensure!(
                    self.drafts.is_empty(),
                    "Apply or discard drafts before upgrading"
                );
                let next = migration::commit(
                    self.plan.as_ref().context("No migration plan")?,
                    self.project()?,
                    self.next_game.as_ref().context("New source missing")?,
                )?;
                self.project = Some(next);
                self.game = self.next_game.take();
                self.map = None;
                self.clear_transient();
                self.saved_hash.clear();
                self.status()
            }
            "upgrade_report" => {
                let path = Path::new(s(&args, "path")?);
                export::outside_game(self.game()?, path)?;
                if let Some(g) = &self.next_game {
                    export::outside_game(g, path)?
                }
                let plan = self.plan.as_ref().context("No migration plan")?;
                let text = if s(&args, "format")? == "md" {
                    migration::markdown(plan)
                } else {
                    serde_json::to_string_pretty(&migration::report_json(plan)?)?
                };
                project::atomic(path, text.as_bytes())?;
                Ok(json!(true))
            }
            "map_index" => {
                let cache = PathBuf::from(s(&args, "cache")?);
                let m = map::Map::build(self.game()?, &cache, |percent| {
                    progress(json!({"operation":"map_index","percent":percent}))
                })?;
                let result = json!({"width":m.index.width,"height":m.index.height,"regions":m.index.regions.len()});
                self.map = Some(m);
                Ok(result)
            }
            "map_tile" => {
                let m = self.map.as_ref().context("Index the map first")?;
                let u = |k: &str| -> Result<u32> {
                    u32::try_from(
                        args[k]
                            .as_u64()
                            .context("Expected unsigned map coordinate")?,
                    )
                    .context("Coordinate overflow")
                };
                Ok(
                    json!({"image":m.tile(u("x")?,u("y")?,u("width")?,u("height")?,args["selected"].as_str().unwrap_or(""))?}),
                )
            }
            "map_hit" => {
                let m = self.map.as_ref().context("Index the map first")?;
                let x = u32::try_from(args["x"].as_u64().context("Invalid x")?)?;
                let y = u32::try_from(args["y"].as_u64().context("Invalid y")?)?;
                let locations = m.hit(x, y)?;
                let game = self.game()?;
                let names = &game.names;
                let labels: Vec<_> = locations
                    .iter()
                    .map(|key| {
                        let label = names
                            .get(key)
                            .map(|name| format!("{name} — {key}"))
                            .unwrap_or_else(|| key.clone());
                        if game.kind(key) != crate::model::LocationKind::Land {
                            format!("{label} ({})", game.kind(key).label())
                        } else {
                            label
                        }
                    })
                    .collect();
                let kinds: Vec<_> = locations.iter().map(|key| game.kind(key)).collect();
                let selectable_locations: Vec<_> = locations
                    .iter()
                    .filter(|key| locations.len() == 1 && game.is_editable(key))
                    .collect();
                Ok(
                    json!({"locations":locations,"labels":labels,"kinds":kinds,"selectable_locations":selectable_locations}),
                )
            }
            _ => bail!("Unknown IPC method: {method}"),
        }
    }
}
pub fn serve() {
    let stdin = std::io::stdin();
    let mut state = Session::default();
    let mut reader = stdin.lock();
    loop {
        let mut line = String::new();
        let read = reader
            .by_ref()
            .take(8 * 1024 * 1024 + 1)
            .read_line(&mut line);
        match read {
            Ok(0) => break,
            Err(e) => {
                eprintln!("IPC read failed: {e}");
                break;
            }
            _ => {}
        }
        if line.len() > 8 * 1024 * 1024 {
            eprintln!("IPC request exceeds 8 MiB; terminating to preserve framing");
            break;
        }
        let request: Result<Value> = serde_json::from_str(&line).map_err(Into::into);
        let (id, response) = match request {
            Ok(v) => {
                let id = v["id"].clone();
                let result = (|| {
                    state.request(s(&v, "method")?, v["params"].clone(), |data| {
                        emit(json!({"event":"progress","data":data}))
                    })
                })();
                (id, result)
            }
            Err(e) => (Value::Null, Err(e)),
        };
        match response {
            Ok(result) => emit(json!({"id":id,"result":result})),
            Err(error) => emit(
                json!({"id":id,"error":{"message":format!("{error:#}"),"operation":"request","working_changed":false}}),
            ),
        }
    }
}
fn emit(v: Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{}", v);
    let _ = out.flush();
}
