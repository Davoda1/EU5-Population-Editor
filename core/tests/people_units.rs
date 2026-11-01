use eu5_population_core::{
    editing::{self, decimal as d, Operation},
    export,
    ipc::Session,
    migration,
    model::{population as p, Definitions, Game, Pop},
    project::Project,
};
use serde_json::json;
use std::{collections::BTreeMap, path::Path};

fn defs() -> Definitions {
    Definitions {
        culture: ["amber", "blue", "copper"].map(String::from).into(),
        religion: ["sun", "moon"].map(String::from).into(),
        kind: ["peasants", "clergy"].map(String::from).into(),
    }
}
fn row(kind: &str, culture: &str, religion: &str, size: &str) -> Pop {
    Pop {
        kind: kind.into(),
        culture: culture.into(),
        religion: religion.into(),
        size: size.into(),
        template: String::new(),
    }
}
fn exact(mode: &str, value: &str) -> Operation {
    Operation::Exact {
        tuple: "peasants|amber|sun".into(),
        mode: mode.into(),
        value: value.into(),
    }
}
fn rebalance(advanced: bool, amber: &str, blue: &str) -> Operation {
    Operation::Rebalance {
        axis: "culture".into(),
        weights: BTreeMap::from([
            ("amber".into(), amber.into()),
            ("blue".into(), blue.into()),
        ]),
        advanced,
    }
}
fn put(root: &Path, path: &str, text: &str) {
    let path = root.join(path);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}
fn fixture(populations: &str) -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    put(root.path(), "main_menu/setup/start/06_pops.txt", populations);
    put(root.path(), "main_menu/setup/start/10_countries.txt", "countries={ALP={own_control_core={alpha beta}}}");
    put(root.path(), "in_game/common/cultures/test.txt", "amber={} blue={} copper={}");
    put(root.path(), "in_game/common/religions/test.txt", "sun={} moon={}");
    put(root.path(), "in_game/common/pop_types/test.txt", "peasants={} clergy={}");
    root
}

#[test]
fn new_absolute_inputs_require_whole_people_but_not_three_literal_digits() {
    let rows = vec![row("peasants", "amber", "sun", "1")];
    let operations = [
        exact("set", "0.0005"),
        exact("add", "0.0005"),
        Operation::Scale { mode: "set".into(), value: "0.0005".into() },
        Operation::Scale { mode: "add".into(), value: "0.0005".into() },
        Operation::Add { pop_type: "clergy".into(), culture: "blue".into(), religion: "moon".into(), size: "0.0005".into() },
    ];
    for operation in operations {
        assert!(editing::preview(&rows, &operation, &defs()).unwrap_err().to_string().contains("whole people"));
    }
    assert_eq!(editing::preview(&rows, &exact("set", "0.001000"), &defs()).unwrap()[0].size, "0.001");
    assert_eq!(editing::preview(&rows, &exact("add", "-0.001"), &defs()).unwrap()[0].size, "0.999");
    let added = editing::preview(&rows, &Operation::Add {
        pop_type: "clergy".into(), culture: "blue".into(), religion: "moon".into(), size: "0.001000".into(),
    }, &defs()).unwrap();
    assert_eq!(added[1].size, "0.001");
}

#[test]
fn decimal_factors_and_percentages_round_results_to_whole_people() {
    let rows = vec![row("peasants", "amber", "sun", "0.001")];
    for (mode, value, expected) in [
        ("multiply", "1.500000000", "0.002"),
        ("multiply", "1.49", "0.001"),
        ("multiply", "0.49", "0"),
        ("percent", "50", "0.002"),
        ("percent", "49.9", "0.001"),
    ] {
        for operation in [exact(mode, value), Operation::Scale { mode: mode.into(), value: value.into() }] {
            let result = editing::preview(&rows, &operation, &defs()).unwrap();
            assert_eq!(result[0].size, expected);
        }
    }
}

#[test]
fn scaling_and_ratios_allocate_indivisible_people_deterministically() {
    let rows = vec![
        row("peasants", "amber", "sun", "1"),
        row("peasants", "blue", "sun", "1"),
        row("peasants", "copper", "sun", "1"),
    ];
    let scaled = editing::preview(&rows, &Operation::Scale { mode: "set".into(), value: "0.001".into() }, &defs()).unwrap();
    assert_eq!(scaled.iter().map(|row| row.size.as_str()).collect::<Vec<_>>(), ["0.001", "0", "0"]);
    let rebalanced = editing::preview(&scaled, &Operation::Rebalance {
        axis: "culture".into(), weights: BTreeMap::from([("amber".into(), "1".into()), ("blue".into(), "1".into()), ("copper".into(), "1".into())]), advanced: false,
    }, &defs()).unwrap();
    assert_eq!(p::total(&rebalanced).unwrap(), d::parse("0.001").unwrap());
    assert!(rebalanced.iter().all(|row| d::is_whole_people(&d::parse(&row.size).unwrap())));
}

#[test]
fn standard_rebalance_restores_zero_group_and_retains_its_profiles() {
    let source = "locations={alpha={define_pop={type=peasants culture=amber religion=sun size=9} define_pop={type=peasants culture=blue religion=moon size=4 future={flag=yes}} define_pop={type=clergy culture=blue religion=sun size=2 future={flag=no}}}}";
    let rows = p::locations(source).unwrap().remove("alpha").unwrap().pops;
    let zeroed = editing::preview(&rows, &rebalance(false, "1", "0"), &defs()).unwrap();
    let restored = editing::preview(&zeroed, &rebalance(false, "1", "1"), &defs()).unwrap();
    assert_eq!(p::total(&restored).unwrap(), d::parse("15").unwrap());
    let blue: Vec<_> = restored.iter().filter(|row| row.culture == "blue").collect();
    assert_eq!(blue.len(), 2);
    for (before, after) in rows[1..].iter().zip(blue) {
        assert_eq!(after.tuple(), before.tuple());
        assert_eq!(after.unknown().unwrap(), before.unknown().unwrap());
        assert_eq!(after.size, "3.75");
    }
}

#[test]
fn fractional_legacy_addition_requires_an_explicit_whole_target() {
    let rows = vec![row("peasants", "amber", "sun", "0.0014")];
    for operation in [exact("add", "0.001"), Operation::Scale { mode: "add".into(), value: "0.001".into() }] {
        assert!(editing::preview(&rows, &operation, &defs()).unwrap_err().to_string().contains("Set exact value"));
    }
    for operation in [exact("set", "0.002"), Operation::Scale { mode: "set".into(), value: "0.002".into() }] {
        assert_eq!(editing::preview(&rows, &operation, &defs()).unwrap()[0].size, "0.002");
    }
    assert_eq!(rows[0].size, "0.0014");
}

#[test]
fn exact_edit_quantizes_duplicate_tuple_rows_without_touching_other_legacy_values() {
    let source = "locations={alpha={define_pop={type=peasants culture=amber religion=sun size=0.0004 future={flag=yes}} define_pop={type=peasants culture=amber religion=sun size=0.0006 future={flag=no}} define_pop={type=clergy culture=blue religion=moon size=0.00012345}}}";
    let rows = p::locations(source).unwrap().remove("alpha").unwrap().pops;
    let result = editing::preview(&rows, &exact("set", "0.003"), &defs()).unwrap();
    assert_eq!(result[0].size, "0.001");
    assert_eq!(result[1].size, "0.002");
    for index in 0..2 {
        assert_eq!(result[index].unknown().unwrap(), rows[index].unknown().unwrap());
    }
    assert_eq!(result[2], rows[2]);
}

#[test]
fn rebalance_rejects_fractional_preserved_totals_until_explicit_normalization() {
    let fractional_total = vec![row("peasants", "amber", "sun", "0.0014")];
    assert!(editing::preview(&fractional_total, &rebalance(false, "1", "1"), &defs()).unwrap_err().to_string().contains("Scale population total"));
    let fractional_buckets = vec![
        row("peasants", "amber", "sun", "0.0004"),
        row("clergy", "blue", "moon", "0.0006"),
    ];
    assert!(editing::preview(&fractional_buckets, &rebalance(false, "1", "1"), &defs()).is_ok());
    assert!(editing::preview(&fractional_buckets, &rebalance(true, "1", "1"), &defs()).unwrap_err().to_string().contains("complementary demographic bucket"));
    let normalized = editing::preview(&fractional_buckets, &Operation::Scale { mode: "set".into(), value: "0.001".into() }, &defs()).unwrap();
    let result = editing::preview(&normalized, &rebalance(true, "1", "1"), &defs()).unwrap();
    assert_eq!(p::total(&result).unwrap(), d::parse("0.001").unwrap());
}

#[test]
fn location_flags_detect_hidden_fractional_rows_and_rejected_previews_preserve_work() {
    let root = fixture("locations={alpha={define_pop={type=peasants culture=amber religion=sun size=0.0004} define_pop={type=peasants culture=amber religion=sun size=0.0006}} beta={define_pop={type=clergy culture=blue religion=moon size=1}}}");
    let mut state = Session::default();
    state.request("load_game", json!({"path":root.path()}), |_| {}).unwrap();
    let before = state.request("location", json!({"key":"alpha"}), |_| {}).unwrap();
    assert_eq!(before["working_total"], "0.001");
    assert_eq!(before["original_fractional_people"], true);
    assert_eq!(before["working_fractional_people"], true);
    let preview = state.request("preview", json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"0.002"}}), |_| {}).unwrap();
    assert_eq!(preview["draft_fractional_people"], false);
    assert!(state.request("preview", json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"0.0005"}}), |_| {}).is_err());
    let retained = state.request("location", json!({"key":"alpha"}), |_| {}).unwrap();
    assert_eq!(retained["working"], before["working"]);
    assert_eq!(retained["draft_token"], preview["draft_token"]);
    assert_eq!(retained["draft"], preview["draft"]);
    let applied = state.request("apply", json!({"key":"alpha","token":preview["draft_token"]}), |_| {}).unwrap();
    assert_eq!(applied["original_fractional_people"], true);
    assert_eq!(applied["working_fractional_people"], false);
}

#[test]
fn legacy_precision_survives_projects_exports_reports_and_migration() {
    let source = "# retained\nlocations={alpha={define_pop={type=peasants culture=amber religion=sun size=0.0014} define_pop={type=clergy culture=blue religion=moon size=0.0026}} beta={define_pop={type=peasants culture=blue religion=moon size=4.0000001}}}\n# footer\n";
    let root = fixture(source);
    let game = Game::load(root.path()).unwrap();
    let mut project = Project::new(&game);
    let mut historical = game.locations["alpha"].pops.clone();
    historical[0].size = "0.0015".into();
    project.set(&game, "alpha", historical.clone()).unwrap();
    let output = tempfile::tempdir().unwrap();
    let path = output.path().join("legacy.eu5popproj");
    project.save(&path).unwrap();
    let loaded = Project::load(&path).unwrap();
    assert_eq!(loaded.changes["alpha"].working, historical);
    let files = export::population_files(&game, &loaded).unwrap();
    let reparsed = p::locations(&files["main_menu/setup/start/06_pops.txt"]).unwrap();
    assert_eq!(reparsed["alpha"].pops[0].size, "0.0015");
    assert_eq!(reparsed["beta"].raw, game.locations["beta"].raw);
    let reports = export::reports(&game, &loaded).unwrap();
    assert!(reports["changes.md"].contains("Original people"));
    assert!(reports["changes.md"].contains("| 4 | 4.1 | 0.1 |"));
    assert!(reports["changes.csv"].contains("size_people,has_fractional_people"));
    assert!(reports["changes.csv"].contains("\"1.5\",\"true\""));
    let json: serde_json::Value = serde_json::from_str(&reports["changes.json"]).unwrap();
    assert_eq!(json[0]["working_total"], "0.0041");
    assert_eq!(json[0]["working_total_people"], "4.1");
    assert_eq!(json[0]["delta_people"], "0.1");
    assert_eq!(json[0]["working_people"][0]["size_people"], "1.5");
    assert_eq!(serde_json::from_value::<Vec<Pop>>(json[0]["working"].clone()).unwrap(), historical);

    let mut new_game = Game::load(root.path()).unwrap();
    new_game.locations.get_mut("alpha").unwrap().pops = editing::scale(&game.locations["alpha"].pops, &d::parse("0.008").unwrap(), 4).unwrap();
    let mut plan = migration::propose(&loaded, &new_game).unwrap();
    assert_eq!(plan.items[0].classification, "Safe — scaled to new vanilla");
    assert_eq!(p::total(plan.items[0].proposal.as_ref().unwrap()).unwrap(), d::parse("0.0082").unwrap());
    migration::resolve(&mut plan, "alpha", "scaled_old").unwrap();
    assert_eq!(p::total(plan.items[0].proposal.as_ref().unwrap()).unwrap(), d::parse("0.0082").unwrap());
    let report = migration::report_json(&plan).unwrap();
    assert_eq!(report["items"][0]["old_total"], "0.004");
    assert_eq!(report["items"][0]["old_total_people"], "4");
    assert!(migration::markdown(&plan).contains("| 4 | 8 |"));
    let restored: migration::Plan = serde_json::from_value(report).unwrap();
    assert_eq!(restored.items[0].proposal, plan.items[0].proposal);
    assert_eq!(std::fs::read_to_string(root.path().join("main_menu/setup/start/06_pops.txt")).unwrap(), source);
}

#[test]
fn people_conversion_keeps_large_counts_and_existing_fractional_precision_exact() {
    assert_eq!(d::people(&d::parse("9007199254740993.000000001").unwrap()), "9007199254740993000.000001");
    assert_eq!(d::people(&d::parse("-0.0000001").unwrap()), "-0.0001");
}

#[test]
fn normalization_with_unchanged_totals_survives_apply_save_export_import_and_migration() {
    let source = "locations={alpha={define_pop={type=peasants culture=amber religion=sun size=0.0004} define_pop={type=peasants culture=amber religion=sun size=0.0006} define_pop={type=clergy culture=blue religion=moon size=0.0014}} beta={define_pop={type=peasants culture=blue religion=moon size=1}}}";
    let root = fixture(source);
    let mut session = Session::default();
    session.request("load_game", json!({"path":root.path()}), |_| {}).unwrap();
    let draft = session.request("preview", json!({"key":"alpha","operation":{"kind":"exact","tuple":"peasants|amber|sun","mode":"set","value":"0.001"}}), |_| {}).unwrap();
    let applied = session.request("apply", json!({"key":"alpha","token":draft["draft_token"]}), |_| {}).unwrap();
    assert_eq!(applied["working_total"], applied["original_total"]);
    // Another, untouched tuple remains fractional: a location-wide boolean is
    // insufficient to recognize that the requested tuple was normalized.
    assert_eq!(applied["working_fractional_people"], true);
    let normalized = session.project.as_ref().unwrap().changes["alpha"].working.clone();
    assert_eq!(normalized.iter().map(|row| row.size.as_str()).collect::<Vec<_>>(), ["0", "0.001", "0.0014"]);
    assert_eq!(session.request("status", json!({}), |_| {}).unwrap()["modified"], 1);
    session.request("undo", json!({}), |_| {}).unwrap();
    assert!(session.project.as_ref().unwrap().changes.is_empty());
    session.request("redo", json!({}), |_| {}).unwrap();
    assert_eq!(session.project.as_ref().unwrap().changes["alpha"].working, normalized);

    let output = tempfile::tempdir().unwrap();
    let project_path = output.path().join("normalized.eu5popproj");
    session.request("save", json!({"path":project_path}), |_| {}).unwrap();
    let loaded = Project::load(&project_path).unwrap();
    assert_eq!(loaded.changes["alpha"].working, normalized);
    let game = session.game.as_ref().unwrap();
    let files = export::population_files(game, &loaded).unwrap();
    let exported = &files["main_menu/setup/start/06_pops.txt"];
    let reparsed = p::locations(exported).unwrap();
    assert_eq!(reparsed["alpha"].pops.iter().map(|row| row.size.as_str()).collect::<Vec<_>>(), ["0", "0.001", "0.0014"]);
    assert_eq!(reparsed["beta"].raw, game.locations["beta"].raw);
    let mod_path = output.path().join("pops.txt");
    std::fs::write(&mod_path, exported).unwrap();
    let imported = eu5_population_core::project::import_mod(game, &mod_path).unwrap();
    assert!(imported.unresolved.is_empty());
    assert_eq!(imported.project.changes["alpha"].working.iter().map(|row| row.size.as_str()).collect::<Vec<_>>(), ["0", "0.001", "0.0014"]);
    let legacy_path = output.path().join("legacy.json");
    std::fs::write(&legacy_path, serde_json::to_vec(&json!({
        "format":"eu5-pop-editor-project", "format_version":1,
        "pops":{"alpha":normalized},
    })).unwrap()).unwrap();
    let legacy = eu5_population_core::project::legacy(game, &legacy_path).unwrap();
    assert!(legacy.unresolved.is_empty());
    assert_eq!(legacy.project.changes["alpha"].working, normalized);

    let next_game = Game::load(root.path()).unwrap();
    let plan = migration::propose(&loaded, &next_game).unwrap();
    assert_eq!(plan.items[0].classification, "Safe — unchanged vanilla");
    let migrated = migration::commit(&plan, &loaded, &next_game).unwrap();
    assert_eq!(migrated.changes["alpha"].working, normalized);
    assert_eq!(std::fs::read_to_string(root.path().join("main_menu/setup/start/06_pops.txt")).unwrap(), source);
}

#[test]
fn restoring_legacy_fractions_removes_the_normalization_change() {
    let root = fixture("locations={alpha={define_pop={type=peasants culture=amber religion=sun size=0.0004} define_pop={type=peasants culture=amber religion=sun size=0.0006}}}");
    let game = Game::load(root.path()).unwrap();
    let baseline = &game.locations["alpha"].pops;
    let mut project = Project::new(&game);
    let normalized = editing::preview(baseline, &exact("set", "0.001"), &game.defs).unwrap();
    project.set(&game, "alpha", normalized).unwrap();
    assert_eq!(project.changes.len(), 1);
    let mut restored = baseline.clone();
    restored.reverse();
    restored[0].size.push('0');
    project.set(&game, "alpha", restored).unwrap();
    assert!(project.changes.is_empty());
}

#[test]
fn harmless_whole_person_row_regrouping_still_counts_as_unchanged() {
    let root = fixture("locations={alpha={define_pop={type=peasants culture=amber religion=sun size=0.001} define_pop={type=peasants culture=amber religion=sun size=0.002}}}");
    let game = Game::load(root.path()).unwrap();
    let mut project = Project::new(&game);
    project.set(&game, "alpha", vec![row("peasants", "amber", "sun", "0.0030")]).unwrap();
    assert!(project.changes.is_empty());
}
