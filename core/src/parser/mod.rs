//! Lossless byte spans over UTF-8. Trivia remains in the source, never reconstructed.
use anyhow::{bail, ensure, Result};
#[derive(Clone, Debug)]
pub struct Node {
    pub key: Option<String>,
    pub op: Option<String>,
    pub atom: Option<String>,
    pub children: Option<Vec<Node>>,
    pub start: usize,
    pub end: usize,
    pub value_start: usize,
    pub value_end: usize,
}
impl Node {
    pub fn block(&self) -> Result<&[Node]> {
        self.children
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Expected block at byte {}", self.start))
    }
    pub fn field(&self, key: &str) -> Result<&Node> {
        let found: Vec<_> = self
            .block()?
            .iter()
            .filter(|n| n.key.as_deref() == Some(key))
            .collect();
        ensure!(
            found.len() == 1,
            "Expected one {key} at byte {}; found {}",
            self.start,
            found.len()
        );
        Ok(found[0])
    }
    pub fn scalar(&self) -> Result<&str> {
        ensure!(
            self.children.is_none(),
            "Expected scalar at byte {}",
            self.start
        );
        self.atom
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Missing scalar"))
    }
    pub fn canonical(&self) -> String {
        let v = if let Some(c) = &self.children {
            // Duplicate keys or mixed lists can encode ordered future behavior.
            // Sort only an unambiguous dictionary; preserve all other order.
            let keys: std::collections::BTreeSet<_> =
                c.iter().filter_map(|n| n.key.as_deref()).collect();
            if keys.len() != c.len() {
                return format!(
                    "{:?}{:?}{}{{ordered:{}}}",
                    self.key,
                    self.op,
                    self.atom.as_deref().unwrap_or(""),
                    c.iter().map(Node::canonical).collect::<Vec<_>>().join(";")
                );
            }
            let mut pairs: Vec<_> = c
                .iter()
                .filter(|n| n.key.is_some())
                .map(Node::canonical)
                .collect();
            pairs.sort();
            // Bare list order can carry meaning; preserve it conservatively.
            let bare: Vec<_> = c
                .iter()
                .filter(|n| n.key.is_none())
                .map(Node::canonical)
                .collect();
            format!(
                "{}{{{}|{}}}",
                self.atom.as_deref().unwrap_or(""),
                pairs.join(";"),
                bare.join(";")
            )
        } else {
            serde_json::to_string(&self.atom).unwrap()
        };
        format!("{:?}{:?}{}", self.key, self.op, v)
    }
}
#[derive(Clone, Debug)]
struct Token {
    text: String,
    start: usize,
    end: usize,
    quoted: bool,
}
fn lex(s: &str) -> Result<Vec<Token>> {
    let b = s.as_bytes();
    let mut i = if s.starts_with('\u{feff}') { 3 } else { 0 };
    let mut out = vec![];
    while i < b.len() {
        if b[i].is_ascii_whitespace() {
            i += 1;
            continue;
        }
        if b[i] == b'#' {
            while i < b.len() && b[i] != b'\n' {
                i += 1
            }
            continue;
        }
        let start = i;
        if b[i] == b'"' {
            i += 1;
            let mut value = String::new();
            let mut closed = false;
            while i < b.len() {
                if b[i] == b'"' {
                    i += 1;
                    closed = true;
                    break;
                }
                if b[i] == b'\\' {
                    i += 1;
                    ensure!(i < b.len(), "Incomplete escape at byte {i}");
                    match b[i] {
                        b'"' => {
                            value.push('"');
                            i += 1;
                            continue;
                        }
                        b'\\' => {
                            value.push('\\');
                            i += 1;
                            continue;
                        }
                        b'n' => {
                            value.push('\n');
                            i += 1;
                            continue;
                        }
                        b'r' => {
                            value.push('\r');
                            i += 1;
                            continue;
                        }
                        b't' => {
                            value.push('\t');
                            i += 1;
                            continue;
                        }
                        _ => value.push('\\'),
                    }
                }
                let ch = s[i..].chars().next().unwrap();
                value.push(ch);
                i += ch.len_utf8();
            }
            ensure!(closed, "Unterminated quoted string at byte {start}");
            out.push(Token {
                text: value,
                start,
                end: i,
                quoted: true,
            });
            continue;
        }
        if b"{}=<>!?+".contains(&b[i]) {
            i += 1;
            if i < b.len() && b[i] == b'=' && b[start] != b'{' && b[start] != b'}' {
                i += 1
            }
        } else {
            while i < b.len() && !b[i].is_ascii_whitespace() && !b"{}=<>!?+#\"".contains(&b[i]) {
                i += 1
            }
        }
        ensure!(i > start, "Unexpected byte at {i}");
        out.push(Token {
            text: s[start..i].to_owned(),
            start,
            end: i,
            quoted: false,
        });
    }
    Ok(out)
}
fn sequence(ts: &[Token], i: &mut usize, nested: bool, depth: usize) -> Result<Vec<Node>> {
    ensure!(depth <= 256, "Nesting exceeds supported depth 256");
    let mut nodes = vec![];
    while *i < ts.len() {
        if ts[*i].text == "}" && !ts[*i].quoted {
            ensure!(nested, "Unexpected closing brace at {}", ts[*i].start);
            *i += 1;
            return Ok(nodes);
        }
        let first = ts[*i].clone();
        *i += 1;
        let mut key = None;
        let mut op = None;
        let mut val = first.clone();
        if *i < ts.len()
            && !ts[*i].quoted
            && ["=", "<", ">", "<=", ">=", "!=", "?=", "+=", "=="].contains(&ts[*i].text.as_str())
        {
            key = Some(first.text.clone());
            op = Some(ts[*i].text.clone());
            *i += 1;
            ensure!(*i < ts.len(), "Missing value for {}", first.text);
            val = ts[*i].clone();
            *i += 1;
        }
        ensure!(
            val.text != "}" || val.quoted,
            "Missing value at byte {}",
            val.start
        );
        let value_start = val.start;
        let mut atom = Some(val.text.clone());
        let mut children = None;
        let mut end = val.end;
        let typed =
            !val.quoted && *i < ts.len() && !ts[*i].quoted && ts[*i].text == "{" && val.text != "{";
        if (val.text == "{" && !val.quoted) || typed {
            if typed {
                *i += 1
            } else {
                atom = None
            }
            children = Some(sequence(ts, i, true, depth + 1)?);
            end = ts[*i - 1].end;
        }
        nodes.push(Node {
            key,
            op,
            atom,
            children,
            start: first.start,
            end,
            value_start,
            value_end: end,
        });
    }
    if nested {
        bail!("Unclosed block at end of file")
    }
    Ok(nodes)
}
pub fn parse(s: &str) -> Result<Vec<Node>> {
    let t = lex(s)?;
    sequence(&t, &mut 0, false, 0)
}
pub fn named<'a>(nodes: &'a [Node], name: &str) -> Result<&'a Node> {
    let matches: Vec<_> = nodes
        .iter()
        .filter(|n| n.key.as_deref() == Some(name))
        .collect();
    ensure!(
        matches.len() == 1,
        "Expected one {name} block, found {}",
        matches.len()
    );
    Ok(matches[0])
}
pub fn patch(source: &str, mut edits: Vec<(usize, usize, String)>) -> Result<String> {
    edits.sort_by_key(|e| e.0);
    let mut last = 0;
    let mut out = String::with_capacity(source.len());
    for (a, b, v) in edits {
        ensure!(
            a >= last && a <= b && b <= source.len(),
            "Overlapping/invalid source patch"
        );
        out.push_str(&source[last..a]);
        out.push_str(&v);
        last = b;
    }
    out.push_str(&source[last..]);
    Ok(out)
}

/// Preserve ordering whenever duplicate assignments or bare values could matter.
pub fn canonical_fields(nodes: &[&Node]) -> String {
    let keys: std::collections::BTreeSet<_> =
        nodes.iter().filter_map(|n| n.key.as_deref()).collect();
    let mut fields: Vec<_> = nodes.iter().map(|n| n.canonical()).collect();
    if keys.len() == nodes.len() {
        fields.sort();
        fields.join(";")
    } else {
        format!("ordered:{}", fields.join(";"))
    }
}
