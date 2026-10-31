use eu5_population_core::{editing, export, model::Game, project::Project};
use std::path::Path;

const POPS: &str = "# preserve source\nlocations={ alpha={define_pop={type=peasants size=3 culture=amber religion=sun}} beta={} }\n";
const OWNERS: &str = "countries={countries={ALP={own_control_core={alpha beta}}}}";

fn put(root: &Path, path: &str, text: &str) {
    let path = root.join(path);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}
fn fixture(folder: &str) -> tempfile::TempDir {
    let root = tempfile::tempdir().unwrap();
    put(
        root.path(),
        &format!("main_menu/setup/{folder}/06_pops.txt"),
        POPS,
    );
    put(
        root.path(),
        &format!("main_menu/setup/{folder}/10_countries.txt"),
        OWNERS,
    );
    put(root.path(), "in_game/common/cultures/test.txt", "amber={}");
    put(root.path(), "in_game/common/religions/test.txt", "sun={}");
    put(
        root.path(),
        "in_game/common/pop_types/test.txt",
        "peasants={}",
    );
    root
}
fn bookmarks(root: &Path, text: &str) {
    put(root, "main_menu/common/bookmarks/bookmarks.txt", text);
}
fn current() -> tempfile::TempDir {
    let root = fixture("1337");
    bookmarks(
        root.path(),
        "bookmark_1337={start_date=1337.4.1 setup_folder=\"setup/1337\"}",
    );
    root
}
fn error(root: &Path) -> String {
    match Game::load(root) {
        Ok(_) => panic!("expected discovery to fail"),
        Err(e) => format!("{e:#}"),
    }
}

#[test]
fn legacy_start_still_loads_without_bookmarks() {
    let root = fixture("start");
    let game = Game::load(root.path()).unwrap();
    assert_eq!(game.sources.len(), 1);
    assert_eq!(game.owners["alpha"].first().unwrap(), "ALP");
}

#[test]
fn country_metadata_is_not_mistaken_for_ownership() {
    let root = current();
    for (name, text) in [
        (
            "arbitrary_preferences",
            "countries={countries={ALP={area_preferences={iberia=5}}}}",
        ),
        (
            "arbitrary_personalities",
            "countries={countries={ALP={ai_personality=balanced}}}",
        ),
        ("empty_metadata", "countries={countries={}}"),
    ] {
        put(
            root.path(),
            &format!("main_menu/setup/1337/{name}.txt"),
            text,
        );
    }
    let game = Game::load(root.path()).unwrap();
    assert_eq!(game.owners.len(), 2);
    assert!(game
        .hashes
        .contains_key("main_menu/setup/1337/arbitrary_preferences.txt"));
}

#[test]
fn disabled_test_bookmark_cannot_contaminate_owners_or_pops() {
    let root = current();
    bookmarks(root.path(), "bookmark_1337={start_date=1337.4.1 setup_folder=\"setup/1337\"}\n# bookmark_1658={start_date=1658.1.1 setup_folder=\"setup/1658\"}\n");
    put(
        root.path(),
        "main_menu/setup/1658/06_pops.txt",
        "include=\"setup/1337/06_pops\"",
    );
    put(root.path(), "main_menu/setup/1658/10_countries.txt", "include=\"setup/1337/10_countries\" countries={countries={SWE={own_control_core={alpha}}}}");
    let game = Game::load(root.path()).unwrap();
    assert_eq!(
        game.owners["alpha"].iter().cloned().collect::<Vec<_>>(),
        ["ALP"]
    );
    assert_eq!(game.locations.len(), 2);
    assert!(!game.hashes.keys().any(|p| p.contains("1658")));
    put(
        root.path(),
        "main_menu/setup/1658/10_countries.txt",
        "malformed inactive data = {",
    );
    game.verify_sources().unwrap();
    assert!(Game::load(root.path()).is_ok());
    bookmarks(root.path(), "# changed active bookmark definitions");
    assert!(game.verify_sources().is_err());
}

#[test]
fn malformed_ownership_is_rejected_with_filename() {
    for malformed in [
        "countries={countries={ALP={own_control_core=alpha}}}",
        "countries={countries={ALP={own_control_core={alpha=yes}}}}",
        "countries={countries={ALP={own_control_core={{alpha}}}}}",
        "countries={countries={ALP={future={own_control_core={alpha}}}}}",
        "countries={countries={ALP={own_control_core={alpha}} BAD={future={own_control_core={beta}}}}}",
    ] {
        let root = current();
        put(
            root.path(),
            "main_menu/setup/1337/10_countries.txt",
            malformed,
        );
        let err = error(root.path());
        assert!(err.contains("10_countries.txt"), "{err}");
        assert!(err.to_lowercase().contains("ownership"), "{err}");
    }
}

#[test]
fn metadata_only_setup_reports_missing_ownership() {
    let root = current();
    put(
        root.path(),
        "main_menu/setup/1337/10_countries.txt",
        "countries={countries={ALP={ai_personality=balanced}}}",
    );
    assert!(
        error(root.path()).contains("no country ownership setup found in the selected bookmark")
    );
}

#[test]
fn multiple_active_bookmarks_select_earliest_with_warning() {
    let root = current();
    put(
        root.path(),
        "main_menu/setup/1658/06_pops.txt",
        "not valid = {",
    );
    bookmarks(root.path(), "later={start_date=1658.1.1 setup_folder=\"setup/1658\"} earlier={start_date=1337.4.1 setup_folder=\"setup/1337\"}");
    let game = Game::load(root.path()).unwrap();
    assert!(game
        .issues
        .iter()
        .any(|i| i.feature == "Starting scenario" && i.message.contains("earlier")));
    assert_eq!(
        game.sources.keys().next().unwrap(),
        "main_menu/setup/1337/06_pops.txt"
    );
}

#[test]
fn ambiguous_or_unsafe_bookmarks_are_rejected() {
    let root = current();
    put(root.path(), "main_menu/setup/1658/06_pops.txt", POPS);
    for (text, expected) in [
        ("a={start_date=1337.4.1 setup_folder=\"setup/1337\"} b={start_date=1337.4.1 setup_folder=\"setup/1658\"}", "earliest start_date"),
        ("a={setup_folder=\"setup/1337\"} b={start_date=1658.1.1 setup_folder=\"setup/1658\"}", "missing start_date"),
        ("a={setup_folder=\"../setup/1337\"}", "Unsafe setup path"),
    ] {
        bookmarks(root.path(), text);
        let err = error(root.path());
        assert!(err.contains(expected), "{err}");
    }
}

#[test]
fn nested_includes_preserve_source_paths_and_export_edits() {
    let root = current();
    bookmarks(
        root.path(),
        "later={start_date=1658.1.1 setup_folder=\"setup/1658\"}",
    );
    put(
        root.path(),
        "main_menu/setup/1658/06_pops.txt",
        "include=\"setup/shared/pops\"",
    );
    put(
        root.path(),
        "main_menu/setup/shared/pops.txt",
        "include=\"setup/1337/06_pops.txt\"",
    );
    put(
        root.path(),
        "main_menu/setup/1658/10_countries.txt",
        "include=\"setup/1337/10_countries\"",
    );
    let game = Game::load(root.path()).unwrap();
    assert_eq!(
        game.source_for("alpha"),
        Some("main_menu/setup/1337/06_pops.txt")
    );
    assert_eq!(game.sources.len(), 1);
    assert!(game.hashes.contains_key("main_menu/setup/shared/pops.txt"));
    let mut project = Project::new(&game);
    let rows = editing::preview(
        &game.locations["alpha"].pops,
        &editing::Operation::Scale {
            mode: "set".into(),
            value: "9".into(),
        },
        &game.defs,
    )
    .unwrap();
    project.set(&game, "alpha", rows).unwrap();
    let files = export::population_files(&game, &project).unwrap();
    assert_eq!(files.len(), 1);
    let exported = &files["main_menu/setup/1337/06_pops.txt"];
    assert!(exported.starts_with("# preserve source\n"));
    assert!(exported.contains("size=9"));
    assert!(exported.contains("beta={}"));
    game.verify_sources().unwrap();
    put(
        root.path(),
        "main_menu/setup/shared/pops.txt",
        "# include removed",
    );
    assert!(game.verify_sources().is_err());
}

#[test]
fn missing_cyclic_and_unsafe_includes_are_rejected() {
    for (reference, expected) in [
        ("setup/absent/pops", "unavailable"),
        ("setup/1337/06_pops", "cycle"),
        ("../1337/06_pops", "Unsafe setup path"),
        ("/tmp/populations", "Unsafe setup path"),
        ("C:/game/populations", "Unsafe setup path"),
    ] {
        let root = current();
        put(
            root.path(),
            "main_menu/setup/1337/06_pops.txt",
            &format!("include=\"{reference}\""),
        );
        let err = error(root.path());
        assert!(
            err.contains("06_pops.txt") && err.contains(expected),
            "{err}"
        );
    }
}

#[test]
fn inherited_country_override_is_not_silently_merged() {
    let root = current();
    bookmarks(
        root.path(),
        "later={start_date=1658.1.1 setup_folder=\"setup/1658\"}",
    );
    put(
        root.path(),
        "main_menu/setup/1658/06_pops.txt",
        "include=\"setup/1337/06_pops\"",
    );
    put(
        root.path(),
        "main_menu/setup/1658/10_countries.txt",
        "include=\"setup/1337/10_countries\" countries={countries={ALP={own_control_core={beta}}}}",
    );
    let err = error(root.path());
    assert!(
        err.contains("ALP")
            && err.contains("1337/10_countries.txt")
            && err.contains("1658/10_countries.txt")
            && err.contains("ambiguous"),
        "{err}"
    );
}

#[test]
fn inherited_population_override_is_not_silently_merged() {
    let root = current();
    put(root.path(), "main_menu/setup/1337/07_extra_pops.txt", POPS);
    assert!(error(root.path()).contains("location alpha occurs in multiple population files"));
}

#[cfg(unix)]
#[test]
fn include_symlink_cannot_escape_game_directory() {
    let root = current();
    let outside = tempfile::tempdir().unwrap();
    put(outside.path(), "pops.txt", POPS);
    std::os::unix::fs::symlink(
        outside.path().join("pops.txt"),
        root.path().join("main_menu/setup/1337/outside.txt"),
    )
    .unwrap();
    put(
        root.path(),
        "main_menu/setup/1337/06_pops.txt",
        "include=\"outside.txt\"",
    );
    assert!(error(root.path()).contains("escapes the game"));
}
