//! Synthetic location-classification regressions; no game files are bundled.
use base64::Engine;
use eu5_population_core::{
    export,
    ipc::Session,
    map::Map,
    migration,
    model::{Game, LocationKind, Pop},
    project::{self, Change, Project},
};
use serde_json::{json, Value};
use std::path::Path;

const POPS: &str = "locations = {
 alpha = { define_pop = { type = peasants culture = amber religion = sun size = 2 } }
 empty = {} sea = {} lake = {} mountain = {} corridor = {} overlap = {}
 shared_land = {} shared_water = {}
}";
const CLASSIFICATION: &str = "provinces = \"locations.png\"
 sea_zones = { sea overlap shared_water }
 lakes = { lake }
 impassable_mountains = { mountain overlap lake }
 non_ownable = { corridor }
";
const EMPTY_CLASSES: &str = "provinces = \"locations.png\"
 sea_zones = {} lakes = {} impassable_mountains = {} non_ownable = {}";
const BLOCKED: [&str; 6] = [
    "sea",
    "lake",
    "mountain",
    "corridor",
    "overlap",
    "shared_water",
];

fn put(root: &Path, relative: &str, contents: &str) {
    let path = root.join(relative);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, contents).unwrap();
}

fn classes(root: &Path, contents: &str) {
    put(root, "in_game/map_data/default.map", contents);
}

fn fixture() -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    put(root.path(), "main_menu/setup/start/06_pops.txt", POPS);
    put(root.path(), "main_menu/setup/start/10_countries.txt", "countries = { countries = { ALP = { own_control_core = { alpha sea lake mountain corridor overlap shared_land shared_water } } SEA = { own_control_core = { sea } } } }");
    put(
        root.path(),
        "in_game/common/cultures/fixture.txt",
        "amber = {}",
    );
    put(
        root.path(),
        "in_game/common/religions/fixture.txt",
        "sun = {}",
    );
    put(
        root.path(),
        "in_game/common/pop_types/fixture.txt",
        "peasants = {}",
    );
    put(
        root.path(),
        "main_menu/localization/english/fixture.yml",
        "l_english:\n alpha:0 \"Alpha Town\"\n sea:0 \"Synthetic Sea\"\n",
    );
    classes(root.path(), CLASSIFICATION);
    root
}

fn pop() -> Pop {
    serde_json::from_value(json!({"type":"peasants","culture":"amber","religion":"sun","size":"1"}))
        .unwrap()
}

fn add() -> Value {
    json!({"kind":"add","type":"peasants","culture":"amber","religion":"sun","size":"1"})
}

fn req(session: &mut Session, method: &str, args: Value) -> Value {
    session.request(method, args, |_| {}).unwrap()
}

fn session(root: &Path) -> Session {
    let mut session = Session::default();
    req(&mut session, "load_game", json!({"path":root}));
    session
}

fn project_bytes(session: &Session) -> Vec<u8> {
    serde_json::to_vec(session.project.as_ref().unwrap()).unwrap()
}

fn historical_blocked_change(game: &Game, key: &str) -> Project {
    let mut project = Project::new(game);
    let location = &game.locations[key];
    project.changes.insert(
        key.into(),
        Change {
            baseline: location.pops.clone(),
            working: vec![pop()],
            baseline_nonpop: location.nonpop.clone(),
        },
    );
    project
}

fn add_map(root: &Path) {
    put(root, "in_game/map_data/named_locations/fixture.txt", "alpha = 010203 sea = 040506 lake = 070809 mountain = 101112 corridor = 131415 overlap = 161718 shared_land = 191A1B shared_water = 191A1B");
    let colors = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [16, 17, 18],
        [19, 20, 21],
        [22, 23, 24],
        [25, 26, 27],
    ];
    let mut image = image::RgbImage::new(21, 3);
    for (x, _, pixel) in image.enumerate_pixels_mut() {
        *pixel = image::Rgb(colors[(x / 3) as usize]);
    }
    image
        .save(root.join("in_game/map_data/locations.png"))
        .unwrap();
}

fn tile(map: &Map, selected: &str) -> image::RgbImage {
    let url = map.tile(0, 0, 21, 3, selected).unwrap();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(url.strip_prefix("data:image/png;base64,").unwrap())
        .unwrap();
    image::load_from_memory(&bytes).unwrap().to_rgb8()
}

#[test]
fn explicit_kinds_have_water_priority_and_do_not_infer_from_population_or_owner() {
    let root = fixture();
    let game = Game::load(root.path()).unwrap();
    for (key, expected) in [
        ("alpha", "land"),
        ("empty", "land"),
        ("sea", "sea"),
        ("lake", "lake"),
        ("mountain", "impassable"),
        ("corridor", "non_ownable"),
        ("overlap", "sea"),
    ] {
        assert_eq!(
            serde_json::to_value(game.kind(key)).unwrap(),
            json!(expected),
            "{key}"
        );
    }
    assert!(game.is_editable("alpha"));
    assert!(
        game.is_editable("empty"),
        "Unowned, empty ordinary land must remain editable"
    );
    assert!(!game.owners.contains_key("empty"));
    for key in BLOCKED {
        assert!(!game.is_editable(key), "{key}");
    }
    assert!(!game.is_editable("absent"));
}

#[test]
fn absent_classification_remains_compatible_and_reports_the_limitation() {
    let root = fixture();
    classes(root.path(), "provinces = \"locations.png\"");
    let game = Game::load(root.path()).unwrap();
    assert!(game.is_editable("empty"));
    assert!(
        game.is_editable("sea"),
        "Without metadata a key's name is not evidence of its class"
    );
    std::fs::remove_file(root.path().join("in_game/map_data/default.map")).unwrap();
    let game = Game::load(root.path()).unwrap();
    assert!(game.is_editable("empty"));
    assert!(game.issues.iter().any(|issue| issue.severity == "warning"
        && (issue.message.to_lowercase().contains("classif")
            || issue.file.ends_with("default.map"))));
}

#[test]
fn malformed_present_classification_fails_without_replacing_the_session() {
    let valid = fixture();
    let invalid = fixture();
    let mut state = session(valid.path());
    req(
        &mut state,
        "preview",
        json!({"key":"empty","operation":add()}),
    );
    let before = project_bytes(&state);
    let status = req(&mut state, "status", json!({}));
    for text in [
        "sea_zones { sea }",
        "wrapper = { sea_zones = { sea } }",
        "sea_zones = sea lakes = {} impassable_mountains = {} non_ownable = {}",
        "sea_zones = { sea = yes } lakes = {} impassable_mountains = {} non_ownable = {}",
        "sea_zones = { { sea } } lakes = {} impassable_mountains = {} non_ownable = {}",
        "sea_zones = {} sea_zones = {} lakes = {} impassable_mountains = {} non_ownable = {}",
        "sea_zones = { sea lakes = {} impassable_mountains = {} non_ownable = {}",
    ] {
        classes(invalid.path(), text);
        assert!(
            Game::load(invalid.path()).is_err(),
            "Accepted malformed metadata: {text}"
        );
        assert!(state
            .request("load_game", json!({"path":invalid.path()}), |_| {})
            .is_err());
        assert_eq!(project_bytes(&state), before);
        assert_eq!(req(&mut state, "status", json!({})), status);
    }
    classes(invalid.path(), EMPTY_CLASSES);
    assert!(Game::load(invalid.path()).unwrap().is_editable("sea"));
    classes(invalid.path(), "sea_zones = { sea }");
    let partial = Game::load(invalid.path()).unwrap();
    assert!(!partial.is_editable("sea"));
    assert!(
        partial.is_editable("lake"),
        "Omitted classification lists are empty"
    );
}

#[test]
fn classification_changes_invalidate_the_source_fingerprint() {
    let root = fixture();
    let game = Game::load(root.path()).unwrap();
    classes(
        root.path(),
        &CLASSIFICATION.replace("{ corridor }", "{ corridor alpha }"),
    );
    let changed = Game::load(root.path()).unwrap();
    assert_ne!(changed.fingerprint, game.fingerprint);
    assert!(game.verify_sources().is_err());
    assert!(!changed.is_editable("alpha"));
}

#[test]
fn browser_lists_counts_and_direct_requests_exclude_blocked_locations() {
    let root = fixture();
    let mut state = session(root.path());
    let locations = req(&mut state, "locations", json!({}));
    let keys: Vec<_> = locations["items"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["key"].as_str().unwrap())
        .collect();
    assert_eq!(keys, ["alpha", "empty", "shared_land"]);
    assert_eq!(locations["total"], 3);
    let status = req(&mut state, "status", json!({}));
    assert_eq!(status["countries"].as_array().unwrap().len(), 1);
    assert_eq!(status["countries"][0]["tag"], "ALP");
    assert_eq!(status["countries"][0]["count"], 2);
    req(
        &mut state,
        "select",
        json!({"country":"ALP","location":"alpha"}),
    );
    let before = project_bytes(&state);
    for key in BLOCKED {
        for (method, args) in [
            ("location", json!({"key":key})),
            ("select", json!({"country":"ALP","location":key})),
            ("preview", json!({"key":key,"operation":add()})),
            ("apply", json!({"key":key,"token":1})),
        ] {
            assert!(
                state.request(method, args, |_| {}).is_err(),
                "{method} accepted {key}"
            );
            assert_eq!(
                project_bytes(&state),
                before,
                "{method} mutated state on rejection"
            );
        }
    }
    assert_eq!(req(&mut state, "status", json!({}))["drafts"], 0);
    let draft = req(
        &mut state,
        "preview",
        json!({"key":"empty","operation":add()}),
    );
    let applied = req(
        &mut state,
        "apply",
        json!({"key":"empty","token":draft["draft_token"]}),
    );
    assert_eq!(applied["working_total"], "1");
}

#[test]
fn apply_rechecks_classification_before_touching_a_preexisting_draft() {
    let root = fixture();
    let mut state = session(root.path());
    let draft = req(
        &mut state,
        "preview",
        json!({"key":"empty","operation":add()}),
    );
    // Simulate a stale draft crossing a classification refresh without relying
    // on the UI or on the separate source-fingerprint guard to reject it.
    state
        .game
        .as_mut()
        .unwrap()
        .location_kinds
        .insert("empty".into(), LocationKind::NonOwnable);
    let before = project_bytes(&state);
    let status = req(&mut state, "status", json!({}));
    assert!(state
        .request(
            "apply",
            json!({"key":"empty","token":draft["draft_token"]}),
            |_| {}
        )
        .is_err());
    assert_eq!(project_bytes(&state), before);
    assert_eq!(req(&mut state, "status", json!({})), status);
    state.game.as_mut().unwrap().location_kinds.remove("empty");
    assert_eq!(
        req(&mut state, "location", json!({"key":"empty"}))["draft_token"],
        draft["draft_token"]
    );
}

#[test]
fn direct_project_mutation_and_export_cannot_introduce_blocked_population() {
    let root = fixture();
    let game = Game::load(root.path()).unwrap();
    for key in BLOCKED {
        let mut project = Project::new(&game);
        assert!(project.set(&game, key, vec![pop()]).is_err(), "{key}");
        assert!(project.changes.is_empty());
        let historical = historical_blocked_change(&game, key);
        assert!(historical.validate_locations(&game).is_err());
        assert!(export::population_files(&game, &historical).is_err());
    }
    let mut project = Project::new(&game);
    project.set(&game, "empty", vec![pop()]).unwrap();
    project.validate_locations(&game).unwrap();
    assert!(!export::population_files(&game, &project)
        .unwrap()
        .is_empty());
}

#[test]
fn rejected_open_and_save_preserve_confirmed_work_drafts_and_existing_files() {
    let root = fixture();
    let output = tempfile::tempdir().unwrap();
    let mut state = session(root.path());
    let draft = req(
        &mut state,
        "preview",
        json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"3"}}),
    );
    req(
        &mut state,
        "apply",
        json!({"key":"alpha","token":draft["draft_token"]}),
    );
    let good = output.path().join("working.eu5popproj");
    req(&mut state, "save", json!({"path":good}));
    let good_bytes = std::fs::read(&good).unwrap();
    req(
        &mut state,
        "preview",
        json!({"key":"empty","operation":add()}),
    );
    let before = project_bytes(&state);
    let status = req(&mut state, "status", json!({}));
    let old = historical_blocked_change(state.game.as_ref().unwrap(), "corridor");
    let bad = output.path().join("historical.eu5popproj");
    old.save(&bad).unwrap();
    assert!(state.request("open", json!({"path":bad}), |_| {}).is_err());
    assert_eq!(project_bytes(&state), before);
    assert_eq!(req(&mut state, "status", json!({})), status);
    state.project.as_mut().unwrap().changes.extend(old.changes);
    let before = project_bytes(&state);
    assert!(state.request("save", json!({"path":good}), |_| {}).is_err());
    assert_eq!(project_bytes(&state), before);
    assert_eq!(std::fs::read(&good).unwrap(), good_bytes);
    assert_eq!(req(&mut state, "status", json!({}))["drafts"], 1);
}

#[test]
fn imports_report_blocked_changes_without_discarding_current_work() {
    let root = fixture();
    let output = tempfile::tempdir().unwrap();
    let game = Game::load(root.path()).unwrap();
    let legacy = output.path().join("legacy.json");
    std::fs::write(&legacy, serde_json::to_vec(&json!({"format":"eu5-pop-editor-project","format_version":1,"pops":{"corridor":[pop()]}})).unwrap()).unwrap();
    let plan = project::legacy(&game, &legacy).unwrap();
    assert!(plan.unresolved.contains_key("corridor"));
    assert!(plan.project.changes.is_empty());
    let mut state = session(root.path());
    req(
        &mut state,
        "preview",
        json!({"key":"empty","operation":add()}),
    );
    let before = project_bytes(&state);
    let status = req(&mut state, "status", json!({}));
    req(&mut state, "legacy_plan", json!({"path":legacy}));
    assert!(state
        .request("legacy_commit", json!({"confirm_baseline":true}), |_| {})
        .is_err());
    assert_eq!(project_bytes(&state), before);
    assert_eq!(req(&mut state, "status", json!({})), status);

    let modfile = output.path().join("06_pops.txt");
    std::fs::write(&modfile, POPS.replace("corridor = {}", "corridor = { define_pop = { type = peasants culture = amber religion = sun size = 1 } }")).unwrap();
    let plan = project::import_mod(&game, &modfile).unwrap();
    assert_eq!(
        plan.unresolved
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        ["corridor"]
    );
    assert!(plan.project.changes.is_empty());
    std::fs::write(&modfile, POPS.replace("size = 2", "size = 3")).unwrap();
    let valid = project::import_mod(&game, &modfile).unwrap();
    assert!(
        valid.unresolved.is_empty(),
        "Unchanged blocked entries in a whole population file are not edits"
    );
    assert_eq!(
        valid
            .project
            .changes
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        ["alpha"]
    );
}

#[test]
fn migration_requires_explicit_discard_when_land_becomes_blocked() {
    let old_root = fixture();
    let new_root = fixture();
    let old_game = Game::load(old_root.path()).unwrap();
    let mut old = Project::new(&old_game);
    old.set(&old_game, "alpha", vec![pop()]).unwrap();
    old.selected_location = "alpha".into();
    classes(
        new_root.path(),
        &CLASSIFICATION.replace("{ corridor }", "{ corridor alpha }"),
    );
    let new_game = Game::load(new_root.path()).unwrap();
    let mut plan = migration::propose(&old, &new_game).unwrap();
    assert!(
        plan.items[0].proposal.is_none(),
        "A newly blocked location must not retain a population proposal automatically"
    );
    assert!(migration::commit(&plan, &old, &new_game).is_err());
    let mut unsafe_plan = plan.clone();
    if migration::resolve(&mut unsafe_plan, "alpha", "apply_old").is_ok() {
        assert!(migration::commit(&unsafe_plan, &old, &new_game).is_err());
    }
    migration::resolve(&mut plan, "alpha", "keep_new").unwrap();
    plan.acknowledged_topology = true;
    let migrated = migration::commit(&plan, &old, &new_game).unwrap();
    assert!(migrated.changes.is_empty());
    assert!(migrated.selected_location.is_empty());
    migrated.validate_locations(&new_game).unwrap();
    assert_eq!(
        old.changes.len(),
        1,
        "Planning/resolving must not mutate the old project"
    );
}

#[test]
fn rejected_migration_commit_preserves_the_active_game_and_working_project() {
    let old_root = fixture();
    let new_root = fixture();
    classes(
        new_root.path(),
        &CLASSIFICATION.replace("{ corridor }", "{ corridor alpha }"),
    );
    let mut state = session(old_root.path());
    let draft = req(
        &mut state,
        "preview",
        json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"3"}}),
    );
    req(
        &mut state,
        "apply",
        json!({"key":"alpha","token":draft["draft_token"]}),
    );
    req(
        &mut state,
        "select",
        json!({"country":"ALP","location":"alpha"}),
    );
    let before = project_bytes(&state);
    let status = req(&mut state, "status", json!({}));
    req(&mut state, "upgrade_plan", json!({"path":new_root.path()}));
    assert!(state.request("upgrade_commit", json!({}), |_| {}).is_err());
    for choice in ["apply_old", "scaled_old"] {
        assert!(state
            .request(
                "upgrade_resolve",
                json!({"key":"alpha","choice":choice}),
                |_| {}
            )
            .is_err());
    }
    assert_eq!(project_bytes(&state), before);
    assert_eq!(req(&mut state, "status", json!({})), status);
    // Game roots are canonicalized; Windows temp paths may use short names.
    assert_eq!(
        state.game.as_ref().unwrap().root,
        old_root.path().canonicalize().unwrap()
    );
    req(
        &mut state,
        "upgrade_resolve",
        json!({"key":"alpha","choice":"keep_new"}),
    );
    let migrated = req(&mut state, "upgrade_commit", json!({}));
    assert_eq!(migrated["modified"], 0);
    assert_eq!(migrated["selected_location"], "");
    assert_eq!(
        state.game.as_ref().unwrap().root,
        new_root.path().canonicalize().unwrap()
    );
}

#[test]
fn old_project_opens_for_migration_without_old_game_files_when_land_becomes_blocked() {
    let old_root = fixture();
    let new_root = fixture();
    let output = tempfile::tempdir().unwrap();
    let path = output.path().join("old.eu5popproj");
    let old_game = Game::load(old_root.path()).unwrap();
    let mut old = Project::new(&old_game);
    old.set(&old_game, "alpha", vec![pop()]).unwrap();
    old.set(&old_game, "empty", vec![pop()]).unwrap();
    old.selected_location = "alpha".into();
    old.save(&path).unwrap();
    let saved_bytes = std::fs::read(&path).unwrap();
    drop(old_game);
    old_root.close().unwrap();

    classes(
        new_root.path(),
        &CLASSIFICATION.replace("{ corridor }", "{ corridor alpha }"),
    );
    let mut state = session(new_root.path());
    let opened = req(&mut state, "open", json!({"path":path}));
    assert_eq!(opened["compatible"], false);
    assert_eq!(opened["selected_location"], "");
    assert_eq!(opened["modified"], 2);
    let mut expected = old.clone();
    expected.selected_location.clear();
    assert_eq!(
        project_bytes(&state),
        serde_json::to_vec(&expected).unwrap()
    );
    let before = project_bytes(&state);
    let status = req(&mut state, "status", json!({}));

    for key in ["alpha", "empty"] {
        assert!(state
            .request(
                "preview",
                json!({"key":key,"operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"3"}}),
                |_| {}
            )
            .is_err());
    }
    let export_path = output.path().join("export");
    assert!(state
        .request(
            "export",
            json!({"path":export_path,"options":{
                "name":"Synthetic migration", "id":"synthetic-migration", "version":"1.0.0",
                "supported_game_version":"1.4.5", "zip":false, "acknowledge_unverified_version":false
            }}),
            |_| {}
        )
        .is_err());
    assert!(!export_path.exists());

    let plan = req(&mut state, "upgrade_plan", json!({"path":new_root.path()}));
    let blocked = plan["items"]
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["location"] == "alpha")
        .unwrap();
    assert!(blocked["proposal"].is_null());
    assert!(state.request("upgrade_commit", json!({}), |_| {}).is_err());
    for choice in ["apply_old", "scaled_old"] {
        assert!(state
            .request(
                "upgrade_resolve",
                json!({"key":"alpha","choice":choice}),
                |_| {}
            )
            .is_err());
    }
    assert_eq!(project_bytes(&state), before);
    assert_eq!(req(&mut state, "status", json!({})), status);
    assert_eq!(std::fs::read(&path).unwrap(), saved_bytes);

    req(
        &mut state,
        "upgrade_resolve",
        json!({"key":"alpha","choice":"keep_new"}),
    );
    let migrated = req(&mut state, "upgrade_commit", json!({}));
    assert_eq!(migrated["compatible"], true);
    assert_eq!(migrated["modified"], 1);
    let project = state.project.as_ref().unwrap();
    assert!(!project.changes.contains_key("alpha"));
    assert_eq!(
        project.changes["empty"].working,
        old.changes["empty"].working
    );
    assert_eq!(std::fs::read(&path).unwrap(), saved_bytes);
}

#[test]
fn rendered_classes_preserve_raw_hit_ids_visible_borders_and_rgb_ambiguity() {
    let root = fixture();
    add_map(root.path());
    let game = Game::load(root.path()).unwrap();
    let cache = tempfile::tempdir().unwrap();
    let map = Map::build(&game, cache.path(), |_| {}).unwrap();
    let rendered = tile(&map, "");
    for x in [4, 7, 16, 19] {
        assert_eq!(
            rendered.get_pixel(x, 1).0,
            [48, 106, 145],
            "Water pixel {x}"
        );
    }
    for x in [10, 13] {
        assert_eq!(
            rendered.get_pixel(x, 1).0,
            [72, 77, 84],
            "Blocked land pixel {x}"
        );
    }
    for x in [3, 6, 9, 12, 15, 18] {
        assert_eq!(rendered.get_pixel(x, 1).0, [24, 32, 40], "Border pixel {x}");
    }
    assert_eq!(map.hit(4, 1).unwrap(), ["sea"]);
    assert_eq!(map.hit(16, 1).unwrap(), ["overlap"]);
    assert_eq!(map.hit(19, 1).unwrap(), ["shared_land", "shared_water"]);
    assert_eq!(&std::fs::read(&map.raw).unwrap()[12..15], &[4, 5, 6]);
    assert_eq!(
        tile(&map, "shared_land"),
        rendered,
        "Ambiguous raw RGB must not highlight either identity"
    );
    assert_eq!(
        tile(&map, "sea"),
        rendered,
        "Blocked map locations must not be highlighted as selected"
    );
    assert_eq!(tile(&map, "alpha").get_pixel(1, 1).0, [223, 167, 55]);
}

#[test]
fn ipc_map_hits_expose_classes_but_only_unique_editable_locations_are_selectable() {
    let root = fixture();
    add_map(root.path());
    let cache = tempfile::tempdir().unwrap();
    let mut state = session(root.path());
    req(&mut state, "map_index", json!({"cache":cache.path()}));
    let land = req(&mut state, "map_hit", json!({"x":1,"y":1}));
    assert_eq!(land["locations"], json!(["alpha"]));
    assert_eq!(land["selectable_locations"], json!(["alpha"]));
    assert_eq!(land["kinds"], json!(["land"]));
    let water = req(&mut state, "map_hit", json!({"x":4,"y":1}));
    assert_eq!(water["locations"], json!(["sea"]));
    assert_eq!(water["labels"].as_array().unwrap().len(), 1);
    let label = water["labels"][0].as_str().unwrap();
    assert!(label.contains("Synthetic Sea") && label.contains("sea") && label.contains("Sea zone"));
    assert_eq!(water["selectable_locations"], json!([]));
    assert_eq!(water["kinds"], json!(["sea"]));
    let shared = req(&mut state, "map_hit", json!({"x":19,"y":1}));
    assert_eq!(shared["locations"], json!(["shared_land", "shared_water"]));
    assert_eq!(shared["kinds"], json!(["land", "sea"]));
    assert_eq!(shared["selectable_locations"], json!([]));
}

#[test]
fn cached_geometry_rebuilds_palette_when_location_classification_changes() {
    let root = fixture();
    add_map(root.path());
    let cache = tempfile::tempdir().unwrap();
    let old_game = Game::load(root.path()).unwrap();
    let old = Map::build(&old_game, cache.path(), |_| {}).unwrap();
    let raw = std::fs::read(&old.raw).unwrap();
    assert_ne!(tile(&old, "").get_pixel(1, 1).0, [72, 77, 84]);
    classes(
        root.path(),
        &CLASSIFICATION.replace("{ corridor }", "{ corridor alpha }"),
    );
    let new_game = Game::load(root.path()).unwrap();
    let new = Map::build(&new_game, cache.path(), |_| {}).unwrap();
    assert_eq!(
        new.index.fingerprint, old.index.fingerprint,
        "Classifications do not alter the raw geometry cache key"
    );
    assert_eq!(new.raw, old.raw);
    assert_eq!(std::fs::read(&new.raw).unwrap(), raw);
    assert_eq!(new.hit(1, 1).unwrap(), ["alpha"]);
    assert_eq!(tile(&new, "").get_pixel(1, 1).0, [72, 77, 84]);
    assert_eq!(tile(&new, "alpha"), tile(&new, ""));
}
