use eu5_population_core::{
    editing::{self, decimal as d},
    export,
    ipc::Session,
    map::Map,
    migration,
    model::{population as p, Game},
    parser,
    project::Project,
};
use serde_json::json;
use std::{collections::BTreeMap, path::Path};
const POPS:&str="\u{feff}# synthetic only\r\nlocations = {\r\n alpha = { future_location = { flag = yes }\r\n define_pop = { type = peasants size = 7.001 culture = amber religion = sun future = { flag = yes nested = { note = \"# { escaped \\\" quote\" } } }\r\n define_pop = { type = clergy size = 0.999 culture = amber religion = sun }\r\n define_pop = { type = peasants size = 2 culture = blue religion = moon }\r\n }\r\n beta = { define_pop = { type = peasants size = 4 culture = blue religion = moon } }\r\n gamma = {}\r\n}\r\n# footer unchanged\r\n";
fn put(root: &Path, path: &str, text: &str) {
    let p = root.join(path);
    std::fs::create_dir_all(p.parent().unwrap()).unwrap();
    std::fs::write(p, text).unwrap();
}
fn fixture() -> tempfile::TempDir {
    let root = tempfile::Builder::new()
        .prefix("EU5 synthetic space Ω ")
        .tempdir()
        .unwrap();
    put(root.path(), "main_menu/setup/start/06_pops.txt", POPS);
    put(root.path(),"main_menu/setup/start/10_countries.txt","countries={ countries={ ALP={own_control_core={alpha gamma}} BET={own_control_core={beta}} }}");
    put(
        root.path(),
        "in_game/common/cultures/fixture.txt",
        "amber={} blue={} copper={}",
    );
    put(
        root.path(),
        "in_game/common/religions/fixture.txt",
        "sun={} moon={}",
    );
    put(
        root.path(),
        "in_game/common/pop_types/fixture.txt",
        "peasants={} clergy={}",
    );
    put(
        root.path(),
        "main_menu/localization/english/fixture.yml",
        "\u{feff}l_english:\n ALP:0 \"Alpine Assembly\"\n alpha:0 \"Alpha City\" # comment\n",
    );
    root
}
fn game() -> (tempfile::TempDir, Game) {
    let root = fixture();
    let game = Game::load(root.path()).unwrap();
    (root, game)
}
fn modified(g: &Game) -> Project {
    let mut project = Project::new(g);
    let op = editing::Operation::Exact {
        tuple: "peasants|amber|sun".into(),
        mode: "add".into(),
        value: "1".into(),
    };
    project
        .set(
            g,
            "alpha",
            editing::preview(&g.locations["alpha"].pops, &op, &g.defs).unwrap(),
        )
        .unwrap();
    project
}
#[test]
fn parser_nested_comments_escapes_whitespace_unknowns() {
    let parsed = p::locations(POPS).unwrap();
    assert_eq!(parsed.len(), 3);
    assert_eq!(parsed["alpha"].pops.len(), 3);
    assert!(parsed["alpha"].pops[0]
        .unknown()
        .unwrap()
        .contains("nested"));
    assert!(parser::parse("color=rgb { 1 2 3 } x={ a>=3 b?=foo }").is_ok());
}
#[test]
fn malformed_input_fails_closed() {
    for text in [
        "x={",
        "x=}",
        "x=\"unterminated",
        "}",
        "x={\n# missing brace",
    ] {
        assert!(parser::parse(text).is_err(), "{text}");
    }
    assert!(p::locations("locations={a={}a={}}").is_err());
}
#[test]
fn exact_tuple_changes_no_other_rows_and_preserves_unknown() {
    let (_r, g) = game();
    let before = &g.locations["alpha"].pops;
    let op = editing::Operation::Exact {
        tuple: "peasants|amber|sun".into(),
        mode: "set".into(),
        value: "12.345678".into(),
    };
    let after = editing::preview(before, &op, &g.defs).unwrap();
    assert_eq!(after[0].size, "12.345678");
    assert_eq!(&before[1..], &after[1..]);
    assert_eq!(before[0].unknown().unwrap(), after[0].unknown().unwrap());
    assert!(after[0].rendered().unwrap().contains("future = {"));
}
#[test]
fn deterministic_largest_remainder() {
    let weights = vec![d::parse("1").unwrap(); 3];
    let result = d::allocate(&d::parse("1").unwrap(), &weights, 3).unwrap();
    assert_eq!(result, vec!["0.334", "0.333", "0.333"]);
    assert_eq!(
        d::sum(result.iter().map(|s| s.as_str())).unwrap(),
        d::parse("1").unwrap()
    );
}
#[test]
fn arithmetic_modes_are_exact() {
    let (_r, g) = game();
    for (mode, value, expected) in [
        ("set", "1.23", "1.23"),
        ("add", "-1.001", "6"),
        ("percent", "100", "14.002"),
        ("multiply", "3", "21.003"),
    ] {
        let after = editing::preview(
            &g.locations["alpha"].pops,
            &editing::Operation::Exact {
                tuple: "peasants|amber|sun".into(),
                mode: mode.into(),
                value: value.into(),
            },
            &g.defs,
        )
        .unwrap();
        assert_eq!(after[0].size, expected);
    }
}
#[test]
fn invalid_decimal_and_negative_values_rejected() {
    for input in ["NaN", "inf", "1e5", "1,000", "", "1.2.3", "--1"] {
        assert!(d::parse(input).is_err());
    }
    assert!(d::nonnegative("-1").is_err());
}
#[test]
fn ratio_preserves_total_for_all_axes() {
    let (_r, g) = game();
    for axis in ["culture", "religion", "type"] {
        let names: Vec<_> = g.locations["alpha"]
            .pops
            .iter()
            .map(|p| p.field(axis).to_owned())
            .collect();
        let weights = BTreeMap::from([
            (names[0].clone(), "7".into()),
            (names[2].clone(), "3".into()),
        ]);
        for advanced in [false, true] {
            let after = editing::preview(
                &g.locations["alpha"].pops,
                &editing::Operation::Rebalance {
                    axis: axis.into(),
                    weights: weights.clone(),
                    advanced,
                },
                &g.defs,
            )
            .unwrap();
            assert_eq!(
                p::total(&after).unwrap(),
                p::total(&g.locations["alpha"].pops).unwrap()
            );
        }
    }
}
#[test]
fn scale_add_remove_groups() {
    let (_r, g) = game();
    let rows = &g.locations["alpha"].pops;
    let scaled = editing::preview(
        rows,
        &editing::Operation::Scale {
            mode: "set".into(),
            value: "123.4567".into(),
        },
        &g.defs,
    )
    .unwrap();
    assert_eq!(p::total(&scaled).unwrap(), d::parse("123.4567").unwrap());
    let added = editing::preview(
        rows,
        &editing::Operation::Add {
            pop_type: "clergy".into(),
            culture: "copper".into(),
            religion: "moon".into(),
            size: "1.2".into(),
        },
        &g.defs,
    )
    .unwrap();
    let removed = editing::preview(
        &added,
        &editing::Operation::Remove {
            tuple: "clergy|copper|moon".into(),
        },
        &g.defs,
    )
    .unwrap();
    assert_eq!(rows, &removed);
}
#[test]
fn discovery_content_country_localization() {
    let (_r, g) = game();
    assert_eq!(g.owners["alpha"].first().unwrap(), "ALP");
    assert_eq!(g.names["alpha"], "Alpha City");
    assert_eq!(g.defs.culture.len(), 3);
    assert!(!g.validate().iter().any(|i| i.severity == "error"));
}
#[test]
fn save_load_checksum_and_atomic_replacement() {
    let (_r, g) = game();
    let output = tempfile::tempdir().unwrap();
    let path = output.path().join("A project Ω.eu5popproj");
    let a = Project::new(&g);
    a.save(&path).unwrap();
    let b = modified(&g);
    b.save(&path).unwrap();
    let loaded = Project::load(&path).unwrap();
    assert_eq!(loaded.changes["alpha"].working, b.changes["alpha"].working);
    let mut bytes = std::fs::read_to_string(&path).unwrap();
    bytes = bytes.replace("8.001", "9.001");
    std::fs::write(&path, bytes).unwrap();
    assert!(Project::load(&path).is_err());
    assert_eq!(std::fs::read_dir(output.path()).unwrap().count(), 1);
}
#[test]
fn save_export_never_apply_draft_undo_redo() {
    let (root, g) = game();
    let output = tempfile::tempdir().unwrap();
    let mut session = Session::default();
    let req = |session: &mut Session, method: &str, params| {
        session.request(method, params, |_| {}).unwrap()
    };
    req(&mut session, "load_game", json!({"path":root.path()}));
    let draft = req(
        &mut session,
        "preview",
        json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"999"}}),
    );
    assert_eq!(draft["working_total"], "10");
    assert_ne!(draft["draft_total"], "10");
    let path = output.path().join("project.eu5popproj");
    req(&mut session, "save", json!({"path":path}));
    assert!(Project::load(&path).unwrap().changes.is_empty());
    assert!(
        export::population_files(&g, session.project.as_ref().unwrap())
            .unwrap()
            .is_empty()
    );
    req(&mut session, "discard", json!({"key":"alpha"}));
    let draft = req(
        &mut session,
        "preview",
        json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"8.001"}}),
    );
    assert!(session
        .request("apply", json!({"key":"alpha","token":9999}), |_| {})
        .is_err());
    req(
        &mut session,
        "apply",
        json!({"key":"alpha","token":draft["draft_token"]}),
    );
    assert_eq!(
        req(&mut session, "location", json!({"key":"alpha"}))["working_total"],
        "11"
    );
    req(&mut session, "undo", json!({}));
    assert_eq!(
        req(&mut session, "location", json!({"key":"alpha"}))["working_total"],
        "10"
    );
    req(&mut session, "redo", json!({}));
    assert_eq!(
        req(&mut session, "location", json!({"key":"alpha"}))["working_total"],
        "11"
    );
}
#[test]
fn source_mismatch_blocks_export() {
    let (root, g) = game();
    let project = modified(&g);
    put(
        root.path(),
        "in_game/common/cultures/fixture.txt",
        "amber={} blue={} copper={} new_culture={}",
    );
    let new = Game::load(root.path()).unwrap();
    assert!(export::population_files(&new, &project).is_err());
}
#[test]
fn export_reparse_unknowns_unrelated_bytes_zip_metadata_reports_and_read_only() {
    let (root, g) = game();
    let project = modified(&g);
    let before = std::fs::read(root.path().join("main_menu/setup/start/06_pops.txt")).unwrap();
    let files = export::population_files(&g, &project).unwrap();
    let parsed = p::locations(&files["main_menu/setup/start/06_pops.txt"]).unwrap();
    assert_eq!(parsed["beta"].raw, g.locations["beta"].raw);
    assert_eq!(parsed["alpha"].nonpop, g.locations["alpha"].nonpop);
    assert_eq!(
        parsed["alpha"].pops[0].unknown().unwrap(),
        g.locations["alpha"].pops[0].unknown().unwrap()
    );
    assert!(files.values().next().unwrap().starts_with('\u{feff}'));
    let out = tempfile::tempdir().unwrap();
    let opts = export::Options {
        name: "Synthetic mod".into(),
        id: "synthetic-mod".into(),
        version: "1.0.0".into(),
        supported_game_version: "test".into(),
        zip: true,
        acknowledge_unverified_version: true,
    };
    let dest = export::export(&g, &project, out.path(), &opts).unwrap();
    assert!(dest.join("synthetic-mod/.metadata/metadata.json").is_file());
    for report in ["changes.csv", "changes.md", "changes.json"] {
        assert!(dest.join("synthetic-mod").join(report).is_file());
    }
    let archive =
        zip::ZipArchive::new(std::fs::File::open(dest.join("synthetic-mod.zip")).unwrap()).unwrap();
    assert!(archive
        .file_names()
        .all(|n| n.starts_with("synthetic-mod/")));
    assert_eq!(
        before,
        std::fs::read(root.path().join("main_menu/setup/start/06_pops.txt")).unwrap()
    );
    assert!(export::export(&g, &project, root.path(), &opts).is_err());
}
#[test]
fn migration_unchanged_and_reordered_equivalent() {
    let (_r, g) = game();
    let project = modified(&g);
    let mut nv = Game::load(&g.root).unwrap();
    nv.locations.get_mut("alpha").unwrap().pops.reverse();
    let plan = migration::propose(&project, &nv).unwrap();
    assert_eq!(plan.items[0].classification, "Safe — unchanged vanilla");
    assert_eq!(
        plan.items[0].proposal.as_ref().unwrap(),
        &project.changes["alpha"].working
    );
}
#[test]
fn migration_scaled_exact_total() {
    let (_r, g) = game();
    let project = modified(&g);
    let mut nv = Game::load(&g.root).unwrap();
    nv.locations.get_mut("alpha").unwrap().pops =
        editing::scale(&g.locations["alpha"].pops, &d::parse("20").unwrap(), 3).unwrap();
    let plan = migration::propose(&project, &nv).unwrap();
    assert_eq!(plan.items[0].classification, "Safe — scaled to new vanilla");
    assert_eq!(
        p::total(plan.items[0].proposal.as_ref().unwrap()).unwrap(),
        d::parse("22").unwrap()
    );
}
#[test]
fn structural_and_unknown_changes_conflict_manual_resolution() {
    let (_r, g) = game();
    let project = modified(&g);
    let mut nv = Game::load(&g.root).unwrap();
    nv.locations.get_mut("alpha").unwrap().pops[0].culture = "copper".into();
    let mut plan = migration::propose(&project, &nv).unwrap();
    assert!(plan.items[0].proposal.is_none());
    assert!(migration::commit(&plan, &project, &nv).is_err());
    migration::resolve(&mut plan, "alpha", "keep_new").unwrap();
    let committed = migration::commit(&plan, &project, &nv).unwrap();
    assert!(committed.changes.is_empty());
    let mut nv = Game::load(&g.root).unwrap();
    nv.locations.get_mut("alpha").unwrap().pops[0].template = nv.locations["alpha"].pops[0]
        .template
        .replace("flag = yes", "flag = no");
    assert!(migration::propose(&project, &nv).unwrap().items[0]
        .proposal
        .is_none());
}
#[test]
fn new_removed_ownership_and_tag_candidates() {
    let (_r, g) = game();
    let project = modified(&g);
    let mut nv = Game::load(&g.root).unwrap();
    let removed = nv.locations.remove("beta").unwrap();
    nv.locations.insert("delta".into(), removed);
    nv.owners.insert("alpha".into(), ["NEW".into()].into());
    nv.owners.insert("gamma".into(), ["NEW".into()].into());
    let plan = migration::propose(&project, &nv).unwrap();
    assert!(plan.new_locations.contains(&"delta".into()));
    assert!(plan.removed_locations.contains(&"beta".into()));
    assert!(plan.ownership_changes.contains_key("alpha"));
    assert_eq!(plan.tag_candidates[0].candidates[0].0, "NEW");
    assert!(!plan.tag_candidates[0].ambiguous);
    nv.owners.insert("gamma".into(), ["SECOND".into()].into());
    assert!(migration::propose(&project, &nv).unwrap().tag_candidates[0].ambiguous);
}
#[test]
fn legacy_conversion_reports_missing_without_silent_loss() {
    let (root, g) = game();
    let path = root
        .path()
        .parent()
        .unwrap()
        .join(format!("legacy-{}.json", std::process::id()));
    std::fs::write(&path,serde_json::to_vec(&json!({"format":"eu5-pop-editor-project","format_version":1,"pops":{"missing":[{"type":"peasants","culture":"amber","religion":"sun","size":"1"}]}})).unwrap()).unwrap();
    let plan = eu5_population_core::project::legacy(&g, &path).unwrap();
    assert!(plan.unresolved.contains_key("missing"));
    std::fs::remove_file(path).unwrap();
}
#[test]
fn map_indexes_hits_tiles_and_cache_reuse() {
    let (root, _) = game();
    put(
        root.path(),
        "in_game/map_data/named_locations/fixture.txt",
        "alpha=010203 beta=040506",
    );
    let mut image = image::RgbImage::new(4, 2);
    for (x, _, p) in image.enumerate_pixels_mut() {
        *p = image::Rgb(if x < 2 { [1, 2, 3] } else { [4, 5, 6] });
    }
    image
        .save(root.path().join("in_game/map_data/locations.png"))
        .unwrap();
    let game = Game::load(root.path()).unwrap();
    let cache = tempfile::tempdir().unwrap();
    let map = Map::build(&game, cache.path(), |_| {}).unwrap();
    assert_eq!(map.region("alpha").unwrap().area, 4);
    assert_eq!(map.hit(0, 0).unwrap(), vec!["alpha"]);
    assert!(map
        .tile(0, 0, 4, 2, "alpha")
        .unwrap()
        .starts_with("data:image/png;base64,"));
    let cached = Map::build(&game, cache.path(), |_| {}).unwrap();
    assert_eq!(cached.index.fingerprint, map.index.fingerprint);
}
#[test]
#[ignore = "Requires an explicitly supplied game installation; never bundle game files"]
fn installation_compatibility() {
    let path = std::env::var("EU5_TEST_GAME").expect("Set EU5_TEST_GAME");
    let game = Game::load(Path::new(&path)).unwrap();
    assert!(game.locations.len() > 1000);
    for loc in game.locations.values() {
        let rendered = p::render_location(loc, &loc.pops).unwrap();
        assert_eq!(rendered, loc.raw);
    }
}

#[test]
fn quoted_delimiters_are_not_syntax() {
    let ast = parser::parse(r##"left="{" right="}" equal="=" hash="#""##).unwrap();
    assert_eq!(ast.len(), 4);
    assert_eq!(ast[0].scalar().unwrap(), "{");
    assert_eq!(ast[1].scalar().unwrap(), "}");
}

#[test]
fn optional_malformed_map_does_not_block_demographics() {
    let root = fixture();
    put(
        root.path(),
        "in_game/map_data/default.map",
        "provinces={future=yes}",
    );
    put(
        root.path(),
        "in_game/map_data/named_locations/broken.txt",
        "alpha={",
    );
    let g = Game::load(root.path()).unwrap();
    assert!(g
        .issues
        .iter()
        .any(|i| i.file.ends_with("broken.txt") && i.feature == "Map"));
    assert_eq!(g.locations["alpha"].pops.len(), 3);
}
#[test]
fn stale_migration_plan_does_not_overwrite_new_confirmed_work() {
    let (_r, g) = game();
    let mut project = modified(&g);
    let plan = migration::propose(&project, &g).unwrap();
    project.title = "Changed since planning".into();
    assert!(migration::commit(&plan, &project, &g).is_err());
}
#[test]
fn map_cache_changes_when_definitions_change_and_bounds_reject() {
    let (root, _) = game();
    put(
        root.path(),
        "in_game/map_data/named_locations/fixture.txt",
        "alpha=010203",
    );
    let image = image::RgbImage::from_pixel(2, 2, image::Rgb([1, 2, 3]));
    image
        .save(root.path().join("in_game/map_data/locations.png"))
        .unwrap();
    let cache = tempfile::tempdir().unwrap();
    let g = Game::load(root.path()).unwrap();
    let first = Map::build(&g, cache.path(), |_| {}).unwrap();
    assert!(first.hit(2, 0).is_err());
    put(
        root.path(),
        "in_game/map_data/named_locations/fixture.txt",
        "beta=010203",
    );
    let g = Game::load(root.path()).unwrap();
    let next = Map::build(&g, cache.path(), |_| {}).unwrap();
    assert_ne!(first.index.fingerprint, next.index.fingerprint);
    assert_eq!(next.hit(0, 0).unwrap(), vec!["beta"]);
}
#[test]
fn failed_atomic_save_leaves_existing_project_readable() {
    let (_r, g) = game();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("work.eu5popproj");
    modified(&g).save(&path).unwrap();
    let before = std::fs::read(&path).unwrap();
    assert!(Project::new(&g)
        .save(&path.join("impossible.eu5popproj"))
        .is_err());
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert!(Project::load(&path).is_ok());
}
#[test]
fn mod_import_reconstructs_old_baseline_and_retains_future_fields() {
    let (_r, g) = game();
    let project = modified(&g);
    let files = export::population_files(&g, &project).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("modified.txt");
    std::fs::write(&path, files.values().next().unwrap()).unwrap();
    let imported = eu5_population_core::project::import_mod(&g, &path).unwrap();
    assert!(imported.unresolved.is_empty());
    assert_eq!(
        imported.project.changes["alpha"].baseline,
        project.changes["alpha"].baseline
    );
    assert_eq!(
        p::canonical(&imported.project.changes["alpha"].working).unwrap(),
        p::canonical(&project.changes["alpha"].working).unwrap()
    );
}
#[test]
fn zero_baseline_and_removed_modified_locations_need_explicit_review() {
    let (_r, g) = game();
    let mut project = modified(&g);
    let mut nv = Game::load(&g.root).unwrap();
    nv.locations.remove("alpha");
    let mut plan = migration::propose(&project, &nv).unwrap();
    assert!(migration::commit(&plan, &project, &nv).is_err());
    assert!(migration::resolve(&mut plan, "alpha", "apply_old").is_err());
    migration::resolve(&mut plan, "alpha", "keep_new").unwrap();
    plan.acknowledged_topology = true;
    assert!(migration::commit(&plan, &project, &nv)
        .unwrap()
        .changes
        .is_empty());
    for pop in &mut project.changes.get_mut("alpha").unwrap().baseline {
        pop.size = "0".into();
    }
    assert!(migration::propose(&project, &g).unwrap().items[0]
        .proposal
        .is_none());
}

#[test]
fn ownership_transitions_to_and_from_unowned_are_reported() {
    let (_r, g) = game();
    let project = modified(&g);
    let mut nv = Game::load(&g.root).unwrap();
    nv.owners.remove("alpha");
    assert!(
        migration::propose(&project, &nv).unwrap().ownership_changes["alpha"]
            .1
            .is_empty()
    );
    let mut project = Project::new(&g);
    project.owners.remove("alpha");
    assert!(
        migration::propose(&project, &g).unwrap().ownership_changes["alpha"]
            .0
            .is_empty()
    );
}

#[test]
fn unknown_duplicate_assignments_and_mixed_lists_keep_meaningful_order() {
    let a = parser::parse("future={step=one step=two}").unwrap();
    let b = parser::parse("future={step=two step=one}").unwrap();
    assert_ne!(a[0].canonical(), b[0].canonical());
    let a=p::locations("locations={alpha={define_pop={type=peasants culture=amber religion=sun size=1 future=one future=two}}}").unwrap();
    let b=p::locations("locations={alpha={define_pop={type=peasants culture=amber religion=sun size=1 future=two future=one}}}").unwrap();
    assert_ne!(
        p::canonical(&a["alpha"].pops).unwrap(),
        p::canonical(&b["alpha"].pops).unwrap()
    );
}

#[test]
fn project_format_is_independent_of_application_version() {
    let root = fixture();
    let game = Game::load(root.path()).unwrap();
    let mut project = Project::new(&game);
    project.app_version = "9.9.9".into();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("compatible.eu5popproj");
    project.save(&path).unwrap();
    let loaded = Project::load(&path).unwrap();
    assert_eq!(loaded.format_version, 1);
    assert_eq!(loaded.app_version, "9.9.9");
    assert_eq!(loaded.fingerprint, game.fingerprint);
}
