//! Arbitrary integer-backed rational arithmetic. All IPC values are decimal strings.
use anyhow::{ensure, Result};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, ToPrimitive, Zero};
pub type Q = BigRational;
/// EU5 stores population in thousands: three fractional places represent one person.
pub const PEOPLE_PRECISION: usize = 3;
pub fn is_whole_people(value: &Q) -> bool {
    (value * Q::from_integer(1000.into())).is_integer()
}
/// Exact presentation conversion; stored source/project quantities remain unchanged.
pub fn people(value: &Q) -> String {
    format(&(value * Q::from_integer(1000.into())), 28)
}
pub fn precision(s: &str) -> usize {
    s.split_once('.').map_or(0, |(_, f)| f.len())
}
pub fn parse(s: &str) -> Result<Q> {
    ensure!(
        !s.is_empty() && s.len() <= 128,
        "Decimal must contain 1–128 characters"
    );
    let negative = s.starts_with('-');
    let s = s.strip_prefix('-').unwrap_or(s);
    let mut parts = s.split('.');
    let a = parts.next().unwrap();
    let b = parts.next().unwrap_or("");
    ensure!(
        parts.next().is_none()
            && !a.is_empty()
            && a.bytes().all(|c| c.is_ascii_digit())
            && b.bytes().all(|c| c.is_ascii_digit()),
        "Invalid decimal"
    );
    ensure!(
        b.len() <= 28,
        "More than 28 decimal places: unsupported precision; no value changed"
    );
    let mut n = BigInt::parse_bytes(format!("{a}{b}").as_bytes(), 10).unwrap();
    if negative {
        n = -n
    }
    Ok(Q::new(n, BigInt::from(10u8).pow(b.len() as u32)))
}
pub fn nonnegative(s: &str) -> Result<Q> {
    let x = parse(s)?;
    ensure!(!x.is_negative(), "Population/weight cannot be negative");
    Ok(x)
}
pub fn units(q: &Q, p: usize) -> BigInt {
    let q = q * Q::from_integer(BigInt::from(10u8).pow(p as u32));
    let abs = q.abs();
    let mut v = abs.to_integer();
    if (abs - Q::from_integer(v.clone())) * Q::from_integer(2.into()) >= Q::one() {
        v += 1
    }
    if q.is_negative() {
        -v
    } else {
        v
    }
}
pub fn from_units(v: &BigInt, p: usize) -> String {
    let sign = if v.is_negative() { "-" } else { "" };
    let mut s = v.abs().to_string();
    if p > 0 {
        while s.len() <= p {
            s.insert(0, '0')
        }
        s.insert(s.len() - p, '.');
        while s.ends_with('0') {
            s.pop();
        }
        if s.ends_with('.') {
            s.pop();
        }
    }
    if s == "0" {
        "0".into()
    } else {
        format!("{sign}{s}")
    }
}
pub fn format(q: &Q, p: usize) -> String {
    from_units(&units(q, p), p)
}
pub fn sum<'a>(mut xs: impl Iterator<Item = &'a str>) -> Result<Q> {
    xs.try_fold(Q::zero(), |a, s| Ok(a + nonnegative(s)?))
}
pub fn allocate(total: &Q, weights: &[Q], p: usize) -> Result<Vec<String>> {
    ensure!(
        !total.is_negative() && weights.iter().all(|w| !w.is_negative()),
        "Negative allocation"
    );
    let target = units(total, p);
    let sum: Q = weights.iter().cloned().sum();
    if target.is_zero() {
        return Ok(vec!["0".into(); weights.len()]);
    }
    ensure!(
        !weights.is_empty() && !sum.is_zero(),
        "Cannot distribute a positive total over zero weights"
    );
    let mut base = vec![];
    let mut remainders = vec![];
    for (i, w) in weights.iter().enumerate() {
        let exact = Q::from_integer(target.clone()) * w / &sum;
        let floor = exact.to_integer();
        remainders.push((i, exact - Q::from_integer(floor.clone())));
        base.push(floor);
    }
    let used: BigInt = base.iter().cloned().sum();
    let rest = (target - used)
        .to_usize()
        .ok_or_else(|| anyhow::anyhow!("Invalid allocation residual"))?;
    remainders.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    ensure!(rest <= base.len(), "Residual exceeds population row count");
    for (i, _) in remainders.into_iter().take(rest) {
        base[i] += 1
    }
    Ok(base.iter().map(|v| from_units(v, p)).collect())
}
