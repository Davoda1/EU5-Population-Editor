//! Select one playable setup and follow its includes without mixing start dates.
use super::*;
use anyhow::bail;
use std::path::Component;

pub(super) struct Selection {
    pub files: Vec<PathBuf>,
    pub hashes: BTreeMap<String, String>,
    pub issues: Vec<Issue>,
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn safe_relative(value: &str) -> Result<PathBuf> {
    // Reject Windows absolute/drive paths even when running on Unix.
    ensure!(
        !value.is_empty() && !value.contains('\\') && !value.contains(':'),
        "Unsafe setup path: {value}"
    );
    let path = Path::new(value);
    ensure!(
        path.components().all(|c| matches!(c, Component::Normal(_))),
        "Unsafe setup path: {value}; absolute paths and parent traversal are not supported"
    );
    Ok(path.into())
}

fn date(value: &str) -> Result<(u32, u32, u32)> {
    let parts: Vec<u32> = value
        .split('.')
        .map(str::parse)
        .collect::<std::result::Result<_, _>>()?;
    ensure!(
        parts.len() == 3 && (1..=12).contains(&parts[1]) && (1..=31).contains(&parts[2]),
        "Invalid bookmark start_date: {value}"
    );
    Ok((parts[0], parts[1], parts[2]))
}

pub(super) fn select(root: &Path, all: &[PathBuf]) -> Result<Selection> {
    let mut hashes = BTreeMap::new();
    let mut bookmarks = vec![];
    for base in [root.join("main_menu"), root.to_owned()] {
        let directory = base.join("common/bookmarks");
        for path in all
            .iter()
            .filter(|p| p.starts_with(&directory) && p.extension().is_some_and(|e| e == "txt"))
        {
            let rel = relative(root, path);
            let source = read(path)?;
            let ast = parser::parse(&source).with_context(|| format!("Parse bookmark {rel}"))?;
            hashes.insert(rel.clone(), hash(source.as_bytes()));
            for bookmark in ast.iter().filter(|n| n.children.is_some()) {
                let fields = bookmark.block()?;
                if !fields
                    .iter()
                    .any(|n| n.key.as_deref() == Some("setup_folder"))
                {
                    continue;
                }
                let folder = bookmark
                    .field("setup_folder")?
                    .scalar()
                    .with_context(|| format!("Bookmark setup_folder in {rel}"))?;
                let folder = safe_relative(folder).with_context(|| {
                    format!(
                        "Bookmark {} in {rel}",
                        bookmark.key.as_deref().unwrap_or("<unnamed>")
                    )
                })?;
                ensure!(
                    folder.starts_with("setup"),
                    "Bookmark {rel}: setup_folder must be under setup/"
                );
                let folder = base
                    .join(folder)
                    .canonicalize()
                    .with_context(|| format!("Bookmark {rel}: setup folder is unavailable"))?;
                ensure!(
                    folder.starts_with(root) && folder.is_dir(),
                    "Bookmark {rel}: setup folder is outside the game or not a directory"
                );
                let start = if fields
                    .iter()
                    .any(|n| n.key.as_deref() == Some("start_date"))
                {
                    Some(
                        date(bookmark.field("start_date")?.scalar()?)
                            .with_context(|| format!("Bookmark start_date in {rel}"))?,
                    )
                } else {
                    None
                };
                bookmarks.push((
                    start,
                    folder,
                    bookmark.key.clone().unwrap_or_default(),
                    rel.clone(),
                ));
            }
        }
    }
    let mut issues = vec![];
    let folder = if !bookmarks.is_empty() {
        let folder_count = bookmarks
            .iter()
            .map(|b| &b.1)
            .collect::<BTreeSet<_>>()
            .len();
        if folder_count > 1 {
            ensure!(bookmarks.iter().all(|b| b.0.is_some()),
                "Game Data: multiple active setup folders and a missing start_date; refusing to merge bookmarks");
        }
        bookmarks.sort();
        let selected = &bookmarks[0];
        if folder_count > 1 {
            ensure!(!bookmarks.iter().skip(1).any(|b| b.0 == selected.0 && b.1 != selected.1),
                "Game Data: multiple active setup folders share the earliest start_date; refusing ambiguous bookmark selection");
            issues.push(Issue {
                severity: "warning".into(), file: selected.3.clone(), location: None,
                message: format!("Multiple active bookmarks: loaded earliest start date {} from {}. Other setup folders were not merged.", selected.2, relative(root, &selected.1)),
                feature: "Starting scenario".into(),
                resolution: "This editor uses the earliest active bookmark; use matching game data for a different start date".into(),
            });
        }
        selected.1.clone()
    } else {
        let candidates: Vec<_> = [root.join("main_menu/setup/start"), root.join("setup/start")]
            .into_iter()
            .filter(|p| p.is_dir())
            .collect();
        ensure!(candidates.len() == 1,
            "Game Data: no unambiguous active bookmark setup_folder or legacy setup/start found; select a complete installation");
        candidates[0].canonicalize()?
    };
    let mut files = vec![];
    let mut visited = BTreeSet::new();
    let mut stack = vec![];
    for path in all
        .iter()
        .filter(|p| p.starts_with(&folder) && p.extension().is_some_and(|e| e == "txt"))
    {
        expand(root, path, &mut visited, &mut stack, &mut files)?;
    }
    ensure!(
        !files.is_empty(),
        "Game Data: selected setup folder {} has no readable text files",
        relative(root, &folder)
    );
    Ok(Selection {
        files,
        hashes,
        issues,
    })
}

fn expand(
    root: &Path,
    path: &Path,
    visited: &mut BTreeSet<PathBuf>,
    stack: &mut Vec<PathBuf>,
    files: &mut Vec<PathBuf>,
) -> Result<()> {
    let path = path
        .canonicalize()
        .with_context(|| format!("Setup include unavailable: {}", relative(root, path)))?;
    ensure!(
        path.starts_with(root) && path.is_file(),
        "Setup include escapes the game or is not a file: {}",
        path.display()
    );
    if stack.contains(&path) {
        bail!(
            "Setup include cycle: {} -> {}",
            stack
                .iter()
                .map(|p| relative(root, p))
                .collect::<Vec<_>>()
                .join(" -> "),
            relative(root, &path)
        );
    }
    if visited.contains(&path) {
        return Ok(());
    }
    ensure!(
        stack.len() < 64,
        "Setup includes exceed supported depth in {}",
        relative(root, &path)
    );
    let source = read(&path)?;
    let ast =
        parser::parse(&source).with_context(|| format!("Parse setup {}", relative(root, &path)))?;
    stack.push(path.clone());
    for node in ast.iter().filter(|n| n.key.as_deref() == Some("include")) {
        let value = node
            .scalar()
            .with_context(|| format!("Include in {}", relative(root, &path)))?;
        let reference = safe_relative(value)
            .with_context(|| format!("Include in {}", relative(root, &path)))?;
        let mut target = if reference.starts_with("setup") {
            let setup = path
                .ancestors()
                .find(|p| p.file_name().is_some_and(|n| n == "setup"))
                .ok_or_else(|| {
                    anyhow::anyhow!("Cannot resolve setup include in {}", relative(root, &path))
                })?;
            setup.parent().unwrap().join(reference)
        } else {
            path.parent().unwrap().join(reference)
        };
        if target.extension().is_none() {
            target.set_extension("txt");
        }
        ensure!(
            target.extension().is_some_and(|e| e == "txt"),
            "Unsupported setup include extension in {}: {value}",
            relative(root, &path)
        );
        expand(root, &target, visited, stack, files)
            .with_context(|| format!("Include '{value}' from {}", relative(root, &path)))?;
    }
    stack.pop();
    visited.insert(path.clone());
    files.push(path);
    Ok(())
}
