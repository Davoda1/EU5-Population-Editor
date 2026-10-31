//! One initial scan; subsequent tiles/hits read indexed raw rows from a private cache.
use crate::model::{hash, Game, LocationKind};
use anyhow::{ensure, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};
#[derive(Clone, Serialize, Deserialize)]
pub struct Region {
    pub min_x: u32,
    pub min_y: u32,
    pub max_x: u32,
    pub max_y: u32,
    pub area: u64,
    pub sum_x: u64,
    pub sum_y: u64,
}
#[derive(Serialize, Deserialize)]
pub struct Index {
    pub version: u32,
    pub fingerprint: String,
    pub width: u32,
    pub height: u32,
    pub regions: BTreeMap<u32, Region>,
    pub colors: BTreeMap<String, u32>,
}
pub struct Map {
    pub index: Index,
    pub raw: PathBuf,
    pub reverse: BTreeMap<u32, Vec<String>>,
    pub palette: BTreeMap<u32, [u8; 3]>,
    selectable: BTreeSet<String>,
}
impl Map {
    pub fn build(game: &Game, cache: &Path, mut progress: impl FnMut(u32)) -> Result<Self> {
        crate::export::outside_game(game, cache)?;
        std::fs::create_dir_all(cache)?;
        let map = game.map_path.as_ref().ok_or_else(|| {
            anyhow::anyhow!("Map is unavailable; demographic editing remains available")
        })?;
        progress(0);
        let bytes = std::fs::read(map)?;
        let fingerprint =
            hash(&[hash(&bytes).as_bytes(), &serde_json::to_vec(&game.colors)?].concat());
        let meta = cache.join(format!("{fingerprint}.json"));
        let raw_path = cache.join(format!("{fingerprint}.rgb"));
        let cached = std::fs::read(&meta)
            .ok()
            .and_then(|b| serde_json::from_slice::<Index>(&b).ok())
            .filter(|i| {
                i.version == 1
                    && i.fingerprint == fingerprint
                    && std::fs::metadata(&raw_path)
                        .is_ok_and(|m| m.len() == i.width as u64 * i.height as u64 * 3)
            });
        let index = if let Some(index) = cached {
            index
        } else {
            let mut reader =
                image::ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format()?;
            let mut limits = image::Limits::default();
            limits.max_alloc = Some(1024 * 1024 * 1024);
            limits.max_image_width = Some(32768);
            limits.max_image_height = Some(16384);
            reader.limits(limits);
            let rgb = reader
                .decode()
                .context("Decode map PNG; cache unchanged")?
                .into_rgb8();
            let (w, h) = rgb.dimensions();
            let mut regions: BTreeMap<u32, Region> = BTreeMap::new();
            let mut tmp = tempfile::NamedTempFile::new_in(cache)?;
            for y in 0..h {
                let row = &rgb.as_raw()[(y * w * 3) as usize..((y + 1) * w * 3) as usize];
                tmp.write_all(row)?;
                for (x, p) in row.chunks_exact(3).enumerate() {
                    let color = ((p[0] as u32) << 16) | ((p[1] as u32) << 8) | p[2] as u32;
                    let r = regions.entry(color).or_insert(Region {
                        min_x: x as u32,
                        min_y: y,
                        max_x: x as u32,
                        max_y: y,
                        area: 0,
                        sum_x: 0,
                        sum_y: 0,
                    });
                    r.min_x = r.min_x.min(x as u32);
                    r.max_x = r.max_x.max(x as u32);
                    r.max_y = y;
                    r.area += 1;
                    r.sum_x += x as u64;
                    r.sum_y += y as u64;
                }
                if y % 128 == 0 {
                    progress((y as u64 * 100 / h as u64) as u32);
                }
            }
            tmp.as_file().sync_all()?;
            tmp.persist(&raw_path).map_err(|e| e.error)?;
            let index = Index {
                version: 1,
                fingerprint,
                width: w,
                height: h,
                regions,
                colors: game.colors.clone(),
            };
            crate::project::atomic(&meta, &serde_json::to_vec(&index)?)?;
            index
        };
        let mut reverse: BTreeMap<u32, Vec<String>> = BTreeMap::new();
        let mut palette = BTreeMap::new();
        for (key, rgb) in &game.colors {
            reverse.entry(*rgb).or_default().push(key.clone());
        }
        let mut selectable = BTreeSet::new();
        // Geometry caches retain original RGB identities. Recompute these
        // display colors from current metadata even when reusing cached pixels.
        for (rgb, keys) in &reverse {
            let kind = keys
                .iter()
                .map(|k| game.kind(k))
                .max_by_key(|k| k.priority())
                .unwrap();
            let channels = match kind {
                LocationKind::Sea | LocationKind::Lake => [48, 106, 145],
                LocationKind::Impassable | LocationKind::NonOwnable => [72, 77, 84],
                LocationKind::Land => {
                    let key = &keys[0];
                    let owner = game.owners.get(key).and_then(|v| v.first()).unwrap_or(key);
                    let digest = hash(owner.as_bytes());
                    [0, 2, 4].map(|i| u8::from_str_radix(&digest[i..i + 2], 16).unwrap() / 2 + 60)
                }
            };
            palette.insert(*rgb, channels);
            if keys.len() == 1 && game.is_editable(&keys[0]) {
                selectable.insert(keys[0].clone());
            }
        }
        progress(100);
        Ok(Self {
            index,
            raw: raw_path,
            reverse,
            palette,
            selectable,
        })
    }
    pub fn region(&self, key: &str) -> Option<&Region> {
        self.index
            .colors
            .get(key)
            .and_then(|rgb| self.index.regions.get(rgb))
    }
    pub fn hit(&self, x: u32, y: u32) -> Result<Vec<String>> {
        ensure!(
            x < self.index.width && y < self.index.height,
            "Map coordinates out of bounds"
        );
        let mut f = std::fs::File::open(&self.raw)?;
        f.seek(SeekFrom::Start(
            (y as u64 * self.index.width as u64 + x as u64) * 3,
        ))?;
        let mut p = [0u8; 3];
        f.read_exact(&mut p)?;
        let color = ((p[0] as u32) << 16) | ((p[1] as u32) << 8) | p[2] as u32;
        Ok(self.reverse.get(&color).cloned().unwrap_or_default())
    }
    pub fn tile(&self, x: u32, y: u32, width: u32, height: u32, selected: &str) -> Result<String> {
        ensure!(
            width > 0 && height > 0 && x < self.index.width && y < self.index.height,
            "Invalid map viewport"
        );
        let width = width.min(self.index.width - x);
        let height = height.min(self.index.height - y);
        let ow = width.min(1000);
        let oh = height.min(600);
        let mut image = image::RgbImage::new(ow, oh);
        let selected = self
            .selectable
            .contains(selected)
            .then(|| self.index.colors[selected]);
        let mut f = std::fs::File::open(&self.raw)?;
        let mut row = vec![0; width as usize * 3];
        let mut prev = vec![0u32; ow as usize];
        for yy in 0..oh {
            let sy = y + (yy as u64 * height as u64 / oh as u64) as u32;
            f.seek(SeekFrom::Start(
                (sy as u64 * self.index.width as u64 + x as u64) * 3,
            ))?;
            f.read_exact(&mut row)?;
            let mut left = 0;
            for xx in 0..ow {
                let sx = (xx as u64 * width as u64 / ow as u64) as usize;
                let p = &row[sx * 3..sx * 3 + 3];
                let rgb = ((p[0] as u32) << 16) | ((p[1] as u32) << 8) | p[2] as u32;
                let edge = (xx > 0 && left != rgb) || (yy > 0 && prev[xx as usize] != rgb);
                let color = if selected == Some(rgb) {
                    if edge {
                        [255, 246, 165]
                    } else {
                        [223, 167, 55]
                    }
                } else if edge {
                    [24, 32, 40]
                } else {
                    self.palette.get(&rgb).copied().unwrap_or([43, 60, 73])
                };
                image.put_pixel(xx, yy, image::Rgb(color));
                prev[xx as usize] = rgb;
                left = rgb;
            }
        }
        let mut out = std::io::Cursor::new(Vec::new());
        image.write_to(&mut out, image::ImageFormat::Png)?;
        Ok(format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(out.into_inner())
        ))
    }
}
