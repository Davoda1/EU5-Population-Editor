//! A migration is a proposal. Commit is a separate, explicit operation.
use crate::{
    editing::{self, decimal as d},
    model::{population as p, Game, Pop},
    project::Project,
};
use anyhow::{bail, ensure, Result};
use num_traits::Zero;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Clone, Serialize, Deserialize)]
pub struct Item {
    pub location: String,
    pub classification: String,
    pub old_vanilla: Vec<Pop>,
    pub old_modified: Vec<Pop>,
    pub new_vanilla: Vec<Pop>,
    pub proposal: Option<Vec<Pop>>,
    pub old_total: String,
    pub new_total: String,
    pub ratio: Option<String>,
    pub resolution: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct TagCandidate {
    pub old_tag: String,
    pub candidates: Vec<(String, usize, bool)>,
    pub ambiguous: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Plan {
    pub old_fingerprint: String,
    pub old_project_hash: String,
    pub new_fingerprint: String,
    pub items: Vec<Item>,
    pub new_locations: Vec<String>,
    pub removed_locations: Vec<String>,
    pub ownership_changes: BTreeMap<String, (BTreeSet<String>, BTreeSet<String>)>,
    pub tag_candidates: Vec<TagCandidate>,
    pub confirmed_tag_mappings: BTreeMap<String, String>,
    pub acknowledged_topology: bool,
}
pub fn propose(project: &Project, nv: &Game) -> Result<Plan> {
    let new_set: BTreeSet<_> = nv.locations.keys().cloned().collect();
    let mut items = vec![];
    for (key, c) in &project.changes {
        let old = p::canonical(&c.baseline)?;
        let new = nv.locations.get(key);
        let ov = p::total(&c.baseline)?;
        let nt = if let Some(n) = new {
            p::total(&n.pops)?
        } else {
            d::parse("0")?
        };
        let ratio = if ov.is_zero() { None } else { Some(&nt / &ov) };
        let mut classification = "Conflict — manual review required".to_owned();
        let mut proposal = None;
        if !nv.is_editable(key) && new.is_some() {
            classification = format!("Conflict — restricted location ({})", nv.kind(key).label());
        } else if let Some(n) = new {
            let nc = p::canonical(&n.pops)?;
            if n.nonpop == c.baseline_nonpop && old == nc {
                classification = "Safe — unchanged vanilla".into();
                proposal = Some(c.working.clone());
            } else if n.nonpop == c.baseline_nonpop && old.keys().eq(nc.keys()) && ratio.is_some() {
                classification = "Safe — scaled to new vanilla".into();
                proposal = Some(editing::scale(
                    &c.working,
                    &(p::total(&c.working)? * ratio.as_ref().unwrap()),
                    p::precision(&n.pops).max(p::precision(&c.working)),
                )?);
            }
        } else {
            classification = "Conflict — removed location".into();
        }
        items.push(Item {
            location: key.clone(),
            classification,
            old_vanilla: c.baseline.clone(),
            old_modified: c.working.clone(),
            new_vanilla: new.map(|n| n.pops.clone()).unwrap_or_default(),
            proposal,
            old_total: d::format(&ov, 28),
            new_total: d::format(&nt, 28),
            ratio: ratio.map(|r| format!("{}/{}", r.numer(), r.denom())),
            resolution: None,
        });
    }
    let mut ownership_changes = BTreeMap::new();
    for key in project.locations.intersection(&new_set) {
        let old = project.owners.get(key).cloned().unwrap_or_default();
        let new = nv.owners.get(key).cloned().unwrap_or_default();
        if old != new {
            ownership_changes.insert(key.clone(), (old, new));
        }
    }
    let oldtags: BTreeSet<_> = project.owners.values().flatten().cloned().collect();
    let newtags: BTreeSet<_> = nv.owners.values().flatten().cloned().collect();
    let mut tag_candidates = vec![];
    for tag in oldtags.difference(&newtags) {
        let oldlocs: BTreeSet<_> = project
            .owners
            .iter()
            .filter(|(_, ts)| ts.contains(tag))
            .map(|(k, _)| k)
            .collect();
        let mut candidates = vec![];
        for newtag in &newtags {
            let overlap = nv
                .owners
                .iter()
                .filter(|(k, ts)| ts.contains(newtag) && oldlocs.contains(k))
                .count();
            let same = project
                .names
                .get(tag)
                .zip(nv.names.get(newtag))
                .is_some_and(|(a, b)| a == b);
            if overlap > 0 || same {
                candidates.push((newtag.clone(), overlap, same));
            }
        }
        candidates.sort_by(|a, b| b.1.cmp(&a.1).then(b.2.cmp(&a.2)).then(a.0.cmp(&b.0)));
        let ambiguous = candidates.len() != 1;
        tag_candidates.push(TagCandidate {
            old_tag: tag.clone(),
            candidates,
            ambiguous,
        });
    }
    Ok(Plan {
        old_fingerprint: project.fingerprint.clone(),
        old_project_hash: crate::model::hash(&serde_json::to_vec(project)?),
        new_fingerprint: nv.fingerprint.clone(),
        items,
        new_locations: new_set.difference(&project.locations).cloned().collect(),
        removed_locations: project.locations.difference(&new_set).cloned().collect(),
        ownership_changes,
        tag_candidates,
        confirmed_tag_mappings: BTreeMap::new(),
        acknowledged_topology: false,
    })
}
pub fn resolve(plan: &mut Plan, key: &str, choice: &str) -> Result<()> {
    let item = plan
        .items
        .iter_mut()
        .find(|i| i.location == key)
        .ok_or_else(|| anyhow::anyhow!("Migration item not found"))?;
    ensure!(
        !item.classification.contains("restricted location") || choice == "keep_new",
        "Restricted locations cannot receive population changes; explicitly keep new vanilla"
    );
    let rows = match choice {
        "keep_new" => item.new_vanilla.clone(),
        "apply_old" => {
            ensure!(
                !item.classification.contains("removed"),
                "Removed locations cannot be recreated automatically"
            );
            item.old_modified.clone()
        }
        "scaled_old" => {
            let ov = p::total(&item.old_vanilla)?;
            ensure!(!ov.is_zero(), "Cannot scale from zero old total");
            editing::scale(
                &item.old_modified,
                &(p::total(&item.old_modified)? * p::total(&item.new_vanilla)? / ov),
                p::precision(&item.new_vanilla).max(p::precision(&item.old_modified)),
            )?
        }
        _ => bail!("Unknown explicit resolution"),
    };
    item.proposal = Some(rows);
    item.resolution = Some(choice.into());
    Ok(())
}
pub fn commit(plan: &Plan, old: &Project, nv: &Game) -> Result<Project> {
    ensure!(
        plan.old_project_hash == crate::model::hash(&serde_json::to_vec(old)?),
        "Working project changed after planning; build a new migration plan"
    );
    nv.verify_sources()?;
    ensure!(
        plan.old_fingerprint == old.fingerprint && plan.new_fingerprint == nv.fingerprint,
        "Migration plan source changed; rebuild plan"
    );
    ensure!(
        plan.items.iter().all(|i| i.proposal.is_some()),
        "Unresolved migration conflicts; nothing committed"
    );
    ensure!(
        plan.acknowledged_topology
            || (plan.new_locations.is_empty()
                && plan.removed_locations.is_empty()
                && plan.ownership_changes.is_empty()
                && plan.tag_candidates.is_empty()),
        "Review and acknowledge location/ownership/tag changes before commit"
    );
    let mut new = Project::new(nv);
    new.title = old.title.clone();
    if nv.is_editable(&old.selected_location) {
        new.selected_location = old.selected_location.clone();
    }
    new.selected_country = plan
        .confirmed_tag_mappings
        .get(&old.selected_country)
        .unwrap_or(&old.selected_country)
        .clone();
    for i in &plan.items {
        if !nv.is_editable(&i.location) {
            ensure!(
                i.resolution.as_deref() == Some("keep_new"),
                "Explicitly keep new vanilla for removed or restricted location {}",
                i.location
            );
        } else {
            new.set(nv, &i.location, i.proposal.clone().unwrap())?;
        }
    }
    new.validate_locations(nv)?;
    Ok(new)
}
pub fn markdown(plan: &Plan) -> String {
    let mut out=format!("# Migration plan\n\nPopulation totals are people, converted exactly from EU5 source units (1 source unit = 1,000 people). Existing fractional-person values and migration precision are retained. Ratios are dimensionless.\n\nOld fingerprint: `{}`\n\nNew fingerprint: `{}`\n\n| Location | Classification | OV people | NV people | Ratio | Resolution |\n|---|---|---:|---:|---|---|\n",plan.old_fingerprint,plan.new_fingerprint);
    for i in &plan.items {
        out.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} |\n",
            i.location,
            i.classification,
            d::parse(&i.old_total).map(|value| d::people(&value)).unwrap_or_else(|_| "Invalid total".into()),
            d::parse(&i.new_total).map(|value| d::people(&value)).unwrap_or_else(|_| "Invalid total".into()),
            i.ratio.as_deref().unwrap_or("undefined"),
            i.resolution.as_deref().unwrap_or(if i.proposal.is_some() {
                "Proposed"
            } else {
                "Unresolved"
            })
        ));
    }
    out.push_str(&format!("\n## Location and ownership review\n\n```json\n{}\n```\n",serde_json::to_string_pretty(&serde_json::json!({"new":plan.new_locations,"removed":plan.removed_locations,"ownership":plan.ownership_changes,"tag_candidates":plan.tag_candidates,"confirmed_tag_mappings":plan.confirmed_tag_mappings})).unwrap()));
    out
}

/// Report-only enrichment. Live migration plans and their raw population rows
/// retain the existing shape and exact thousand-person quantities.
pub fn report_json(plan: &Plan) -> Result<serde_json::Value> {
    let mut value = serde_json::to_value(plan)?;
    value["units"] = serde_json::json!({
        "raw_population":"thousands_of_people","population_people":"people","ratio":"dimensionless"
    });
    for (item, original) in value["items"].as_array_mut().unwrap().iter_mut().zip(&plan.items) {
        item["old_total_people"] = serde_json::json!(d::people(&d::parse(&original.old_total)?));
        item["new_total_people"] = serde_json::json!(d::people(&d::parse(&original.new_total)?));
        item["old_vanilla_people"] = crate::export::people_rows(&original.old_vanilla)?;
        item["old_modified_people"] = crate::export::people_rows(&original.old_modified)?;
        item["new_vanilla_people"] = crate::export::people_rows(&original.new_vanilla)?;
        item["proposal_people"] = original.proposal.as_ref()
            .map(|rows| crate::export::people_rows(rows)).transpose()?.unwrap_or(serde_json::Value::Null);
    }
    Ok(value)
}
