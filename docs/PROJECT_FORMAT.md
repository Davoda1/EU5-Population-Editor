# `.eu5popproj` format 1

UTF-8 JSON envelope:

```json
{
  "checksum": "sha256-of-compact-serialized-project",
  "project": {
    "format": "eu5-population-project",
    "format_version": 1,
    "app_version": "1.0.1",
    "title": "Untitled project",
    "fingerprint": "sha256-of-source-hash-map",
    "source_hashes": {},
    "changes": {},
    "owners": {},
    "names": {},
    "locations": [],
    "selected_country": "",
    "selected_location": ""
  }
}
```

Object keys in core maps use deterministic BTreeMap ordering. Checksums use the
core's compact serde_json serialization, not arbitrary whitespace in the file.
The checksum detects corruption; malicious actors can recalculate it.

Each `changes[location]` contains `baseline`, `working` and `baseline_nonpop`.
Population rows have `type`, `culture`, `religion`, decimal-string `size`, and
`template`. Template text contains only that row's retained define_pop source,
allowing unknown field preservation. Baseline non-population semantics are stored
canonically for migration conflict detection. Only modified locations store rows.
Unmodified world keys and country associations store identifiers, not game files.

`source_hashes` keys are game-relative paths. The project has no absolute-path
identity. UI preferences can remember game/project directories separately. Names
contain only country display names needed for migration candidates. Pending drafts
and in-memory undo history are not serialized.

Load validates format/version, checks the checksum and reparses population
templates before replacing session state. A source fingerprint mismatch permits
inspection but blocks edits/export until migration. Unknown project fields are
rejected to prevent an older editor silently dropping newer project information.

Save writes a same-directory temporary file, flushes and synchronizes it, then
uses tempfile's platform-aware persist/replace operation. The target can be on a
path with spaces or Unicode. An unwritable target must leave the previous file
intact. Network-filesystem atomicity still depends on the filesystem contract.

Legacy format `eu5-pop-editor-project`, version 1, is a conversion input only.
It has no trustworthy baseline fingerprint. The operator must explicitly confirm
that currently loaded data is the old vanilla source. Missing locations, unknown
identifiers or future fields that cannot be reconstructed are reported and block
commit. The import plan retains unresolved original JSON rather than skipping it.
