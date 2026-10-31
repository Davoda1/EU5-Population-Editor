use eu5_population_core::{
    export,
    model::{Game, Pop},
    project::Project,
};
use serde_json::json;

#[test]
fn verified_version_exports_without_consent_other_versions_require_it() {
    let root = tempfile::tempdir().unwrap();
    for (file, content) in [
        ("main_menu/setup/start/06_pops.txt", "locations={alpha={} beta={define_pop={type=peasants culture=amber religion=sun size=1}}}"),
        ("main_menu/setup/start/10_countries.txt", "countries={ALP={own_control_core={alpha}}}"),
        ("in_game/common/cultures/test.txt", "amber={}"),
        ("in_game/common/religions/test.txt", "sun={}"),
        ("in_game/common/pop_types/test.txt", "peasants={}"),
    ] {
        let path = root.path().join(file);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }
    let game = Game::load(root.path()).unwrap();
    let mut project = Project::new(&game);
    project
        .set(
            &game,
            "alpha",
            vec![Pop {
                kind: "peasants".into(),
                culture: "amber".into(),
                religion: "sun".into(),
                size: "1".into(),
                template: String::new(),
            }],
        )
        .unwrap();
    let mut options = export::Options {
        name: "Compatibility fixture".into(),
        id: "compatibility-fixture".into(),
        version: "1.0.0".into(),
        supported_game_version: "v1.4.5".into(),
        zip: false,
        acknowledge_unverified_version: false,
    };
    for version in ["1.4.5", "v1.4.5", "V1.4.5"] {
        options.supported_game_version = version.into();
        let out = tempfile::tempdir().unwrap();
        assert!(export::export(&game, &project, out.path(), &options).is_ok());
    }
    for version in ["1.4.6", "1.4.50", "1.4.5-beta", "other"] {
        options.supported_game_version = version.into();
        let out = tempfile::tempdir().unwrap();
        assert!(export::export(&game, &project, out.path(), &options)
            .unwrap_err()
            .to_string()
            .contains("selected game version is unverified"));
        assert_eq!(std::fs::read_dir(out.path()).unwrap().count(), 0);
    }
    options.acknowledge_unverified_version = true;
    let out = tempfile::tempdir().unwrap();
    assert!(export::export(&game, &project, out.path(), &options).is_ok());
}

#[test]
fn older_export_requests_remain_readable_and_missing_consent_defaults_false() {
    let mut value = json!({"name":"Test", "id":"test", "version":"1.0.0", "supported_game_version":"v1.4.5", "zip":false});
    assert!(
        !serde_json::from_value::<export::Options>(value.clone())
            .unwrap()
            .acknowledge_unverified_version
    );
    value["acknowledge_unverified_metadata"] = json!(true);
    assert!(
        serde_json::from_value::<export::Options>(value)
            .unwrap()
            .acknowledge_unverified_version
    );
}
