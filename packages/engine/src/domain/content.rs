use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::elements::{
    BehaviorKind, CategoryId, ElementFlags, ElementId, ElementProps, PhaseChange, Reaction,
    REACTION_LUT_SIZE, BEHAVIOR_KIND_BY_ID, CAT_BIO, CAT_ENERGY, CAT_GAS, CAT_LIQUID, CAT_POWDER,
    CAT_SOLID, CAT_UTILITY, ELEMENT_DATA, EL_ACID, EL_CLONE, EL_DIRT, EL_ELECTRICITY, EL_EMPTY,
    EL_FIRE, EL_GUNPOWDER, EL_ICE, EL_LAVA, EL_METAL, EL_OIL, EL_PLANT, EL_SAND, EL_SEED, EL_SMOKE,
    EL_SPARK, EL_STEAM, EL_STONE, EL_VOID, EL_WATER, EL_WOOD, FLAG_BIO, FLAG_COLD,
    FLAG_CONDUCTIVE, FLAG_CORROSIVE, FLAG_ENERGY, FLAG_FLAMMABLE, FLAG_GAS, FLAG_HOT,
    FLAG_IGNORE_GRAVITY, FLAG_LIQUID, FLAG_NONE, FLAG_POWDER, FLAG_RIGID, FLAG_SOLID,
    FLAG_UTILITY, PHASE_CHANGES, REACTION_INIT_DATA,
};

#[derive(Clone)]
pub struct ContentRegistry {
    elements: Vec<ElementProps>,
    behavior_kind_by_id: Vec<BehaviorKind>,
    phase_changes: Vec<PhaseChange>,
    reaction_lut: Vec<Option<Reaction>>,
    element_key_to_id: HashMap<String, ElementId>,
    element_manifest: Vec<ContentManifestElement>,
}

impl ContentRegistry {
    pub fn from_bundle_json(json: &str) -> Result<Self, String> {
        let bundle: BundleRoot = serde_json::from_str(json).map_err(|e| e.to_string())?;
        Self::from_bundle(bundle)
    }

    pub fn from_generated() -> Self {
        let mut reaction_lut = vec![None; REACTION_LUT_SIZE];
        for (idx, reaction) in REACTION_INIT_DATA.iter() {
            reaction_lut[*idx] = Some(*reaction);
        }

        let mut element_key_to_id = HashMap::new();
        element_key_to_id.insert("base:empty".to_string(), EL_EMPTY);
        element_key_to_id.insert("base:stone".to_string(), EL_STONE);
        element_key_to_id.insert("base:sand".to_string(), EL_SAND);
        element_key_to_id.insert("base:wood".to_string(), EL_WOOD);
        element_key_to_id.insert("base:metal".to_string(), EL_METAL);
        element_key_to_id.insert("base:ice".to_string(), EL_ICE);
        element_key_to_id.insert("base:water".to_string(), EL_WATER);
        element_key_to_id.insert("base:oil".to_string(), EL_OIL);
        element_key_to_id.insert("base:lava".to_string(), EL_LAVA);
        element_key_to_id.insert("base:acid".to_string(), EL_ACID);
        element_key_to_id.insert("base:steam".to_string(), EL_STEAM);
        element_key_to_id.insert("base:smoke".to_string(), EL_SMOKE);
        element_key_to_id.insert("base:fire".to_string(), EL_FIRE);
        element_key_to_id.insert("base:spark".to_string(), EL_SPARK);
        element_key_to_id.insert("base:electricity".to_string(), EL_ELECTRICITY);
        element_key_to_id.insert("base:gunpowder".to_string(), EL_GUNPOWDER);
        element_key_to_id.insert("base:clone".to_string(), EL_CLONE);
        element_key_to_id.insert("base:void".to_string(), EL_VOID);
        element_key_to_id.insert("base:dirt".to_string(), EL_DIRT);
        element_key_to_id.insert("base:seed".to_string(), EL_SEED);
        element_key_to_id.insert("base:plant".to_string(), EL_PLANT);

        let elements = ELEMENT_DATA.to_vec();
        let mut id_to_key: Vec<Option<String>> = vec![None; elements.len()];
        for (k, v) in element_key_to_id.iter() {
            let idx = *v as usize;
            if idx < id_to_key.len() {
                id_to_key[idx] = Some(k.clone());
            }
        }

        let mut element_manifest = Vec::with_capacity(elements.len());
        for (idx, props) in elements.iter().enumerate() {
            let key = id_to_key[idx].clone().unwrap_or_else(|| format!("base:{}", idx));
            let mut it = key.splitn(2, ':');
            let pack = it.next().map(|s| s.to_string());
            let name = it.next().map(|s| s.to_string());
            element_manifest.push(ContentManifestElement {
                id: idx as ElementId,
                key,
                pack,
                name,
                color: props.color,
                hidden: idx == (EL_EMPTY as usize),
                ui: None,
            });
        }

        Self {
            elements,
            behavior_kind_by_id: BEHAVIOR_KIND_BY_ID.to_vec(),
            phase_changes: PHASE_CHANGES.to_vec(),
            reaction_lut,
            element_key_to_id,
            element_manifest,
        }
    }

    pub fn element_count(&self) -> usize {
        self.elements.len()
    }

    pub fn is_valid_element_id(&self, id: ElementId) -> bool {
        (id as usize) < self.elements.len()
    }

    pub fn props(&self, id: ElementId) -> Option<&ElementProps> {
        self.elements.get(id as usize)
    }

    pub fn behavior_kind(&self, id: ElementId) -> BehaviorKind {
        self.behavior_kind_by_id
            .get(id as usize)
            .copied()
            .unwrap_or(BehaviorKind::None)
    }

    pub fn phase_change(&self, id: ElementId) -> PhaseChange {
        self.phase_changes
            .get(id as usize)
            .copied()
            .unwrap_or(PhaseChange { high: None, low: None })
    }

    pub fn check_phase_change(&self, id: ElementId, temp: f32) -> Option<ElementId> {
        let pc = self.phase_change(id);
        if let Some((threshold, new_el)) = pc.high {
            if temp > threshold {
                return Some(new_el);
            }
        }
        if let Some((threshold, new_el)) = pc.low {
            if temp < threshold {
                return Some(new_el);
            }
        }
        None
    }

    pub fn reaction(&self, aggressor: ElementId, victim: ElementId) -> Option<&Reaction> {
        let idx = ((aggressor as usize) << 8) | (victim as usize);
        self.reaction_lut.get(idx)?.as_ref()
    }

    pub fn id_by_key(&self, key: &str) -> Option<ElementId> {
        self.element_key_to_id.get(key).copied()
    }

    pub fn manifest_json(&self) -> String {
        let out = ContentManifest {
            format_version: 1,
            elements: &self.element_manifest,
        };
        serde_json::to_string(&out).unwrap_or_else(|_| "{}".to_string())
    }

    pub fn color_with_variation(&self, id: ElementId, seed: u8) -> Option<u32> {
        let base = self.props(id)?.color;
        let i = (seed & 31) as i32;
        let variation = (i - 16) * 2;

        let a = (base >> 24) & 0xFF;
        let r = (((base >> 16) & 0xFF) as i32 + variation).clamp(0, 255) as u32;
        let g = (((base >> 8) & 0xFF) as i32 + variation).clamp(0, 255) as u32;
        let b = ((base & 0xFF) as i32 + variation).clamp(0, 255) as u32;

        Some((a << 24) | (b << 16) | (g << 8) | r)
    }

    fn from_bundle(bundle: BundleRoot) -> Result<Self, String> {
        let mut max_id: u16 = 0;
        for el in bundle.elements.iter() {
            if el.id > max_id {
                max_id = el.id;
            }
        }

        if max_id > (u8::MAX as u16) {
            return Err(format!("too many elements for u8 ids: max_id={}", max_id));
        }

        let len = (max_id as usize) + 1;
        let mut props_by_id: Vec<Option<ElementProps>> = vec![None; len];
        let mut behavior_by_id: Vec<Option<BehaviorKind>> = vec![None; len];
        let mut phase_by_id: Vec<Option<PhaseChange>> = vec![None; len];
        let mut manifest_by_id: Vec<Option<ContentManifestElement>> = vec![None; len];

        let mut element_key_to_id = HashMap::new();

        for el in bundle.elements.into_iter() {
            let id = el.id as ElementId;

            let (category_id, category_flag) = category_from_str(&el.category)?;

            let density = match el.density {
                Some(v) => v,
                None => match category_id {
                    CAT_UTILITY | CAT_ENERGY | CAT_BIO => 0.0,
                    _ => {
                        return Err(format!(
                            "element {} ({}) has null density but category requires a density",
                            id, &el.key
                        ))
                    }
                },
            };

            let mut flags: ElementFlags = FLAG_NONE;
            flags |= category_flag;
            if el.flags.flammable {
                flags |= FLAG_FLAMMABLE;
            }
            if el.flags.conductive {
                flags |= FLAG_CONDUCTIVE;
            }
            if el.flags.corrosive {
                flags |= FLAG_CORROSIVE;
            }
            if el.flags.hot {
                flags |= FLAG_HOT;
            }
            if el.flags.cold {
                flags |= FLAG_COLD;
            }
            if el.flags.ignore_gravity {
                flags |= FLAG_IGNORE_GRAVITY;
            }
            if el.flags.rigid {
                flags |= FLAG_RIGID;
            }

            let behavior_kind = match el.behavior.as_deref() {
                None => BehaviorKind::None,
                Some(s) => behavior_kind_from_str(s)?,
            };

            let phase = match el.phase_change {
                None => PhaseChange { high: None, low: None },
                Some(pc) => PhaseChange {
                    high: pc.high.map(|h| (h.temp as f32, h.to_id as ElementId)),
                    low: pc.low.map(|l| (l.temp as f32, l.to_id as ElementId)),
                },
            };

            let props = ElementProps {
                color: el.color,
                density: density as f32,
                category: category_id,
                flags,
                dispersion: el.dispersion,
                lifetime: el.lifetime,
                default_temp: el.default_temp as f32,
                heat_conductivity: el.heat_conductivity,
                bounce: el.bounce as f32,
                friction: el.friction as f32,
            };

            let idx = id as usize;
            if idx >= props_by_id.len() {
                return Err(format!("element id out of range: {}", idx));
            }
            if props_by_id[idx].is_some() {
                return Err(format!("duplicate element id: {}", idx));
            }

            props_by_id[idx] = Some(props);
            behavior_by_id[idx] = Some(behavior_kind);
            phase_by_id[idx] = Some(phase);

            let key = el.key;
            element_key_to_id.insert(key.clone(), id);

            let ui = el.ui.map(|ui| ContentManifestElementUi {
                category: ui.category,
                display_name: ui.display_name,
                description: ui.description,
                sort: ui.sort,
                hidden: ui.hidden,
            });

            manifest_by_id[idx] = Some(ContentManifestElement {
                id,
                key,
                pack: el.pack,
                name: el.name,
                color: el.color,
                hidden: el.hidden,
                ui,
            });
        }

        if !matches!(props_by_id.get(EL_EMPTY as usize).and_then(|v| *v), Some(_)) {
            return Err("missing element id 0 (empty)".to_string());
        }

        for (k, v) in bundle.element_key_to_id.into_iter() {
            let id = v as u16;
            if id > (u8::MAX as u16) {
                return Err(format!("elementKeyToId contains u16 id not supported yet: {}", id));
            }
            let id8 = id as ElementId;
            match element_key_to_id.get(&k) {
                Some(existing) if *existing == id8 => {}
                Some(existing) => {
                    return Err(format!(
                        "elementKeyToId mismatch for key {}: map={} elements={}",
                        k, id8, existing
                    ));
                }
                None => {
                    element_key_to_id.insert(k, id8);
                }
            }
        }

        let mut elements = Vec::with_capacity(props_by_id.len());
        let mut behavior_kind_by_id = Vec::with_capacity(props_by_id.len());
        let mut phase_changes = Vec::with_capacity(props_by_id.len());
        let mut element_manifest = Vec::with_capacity(props_by_id.len());

        for idx in 0..props_by_id.len() {
            let props = props_by_id[idx]
                .ok_or_else(|| format!("missing element id {}", idx))?;
            let kind = behavior_by_id[idx]
                .unwrap_or(BehaviorKind::None);
            let phase = phase_by_id[idx]
                .unwrap_or(PhaseChange { high: None, low: None });
            let meta = manifest_by_id[idx]
                .clone()
                .ok_or_else(|| format!("missing element manifest for id {}", idx))?;

            elements.push(props);
            behavior_kind_by_id.push(kind);
            phase_changes.push(phase);
            element_manifest.push(meta);
        }

        let mut reaction_lut = vec![None; REACTION_LUT_SIZE];
        for r in bundle.reactions.into_iter() {
            let aggressor = r.aggressor_id as ElementId;
            let victim = r.victim_id as ElementId;

            let target_becomes = r.result_victim_id as ElementId;
            let source_becomes = match r.result_aggressor_id {
                None => Reaction::NO_CHANGE,
                Some(v) => v as u8,
            };

            let chance = chance_to_u8(r.chance);

            let spawn = r.spawn_id.map(|v| v as ElementId).unwrap_or(EL_EMPTY);

            let reaction = Reaction {
                target_becomes,
                source_becomes,
                chance,
                spawn,
            };

            let idx = ((aggressor as usize) << 8) | (victim as usize);
            if idx >= reaction_lut.len() {
                return Err(format!("reaction idx out of range: {}", idx));
            }
            reaction_lut[idx] = Some(reaction);
        }

        Ok(Self {
            elements,
            behavior_kind_by_id,
            phase_changes,
            reaction_lut,
            element_key_to_id,
            element_manifest,
        })
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentManifest<'a> {
    format_version: u32,
    elements: &'a [ContentManifestElement],
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentManifestElement {
    id: ElementId,
    key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pack: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    color: u32,
    hidden: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    ui: Option<ContentManifestElementUi>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentManifestElementUi {
    category: String,
    display_name: String,
    description: String,
    sort: i32,
    hidden: bool,
}

fn chance_to_u8(chance: f64) -> u8 {
    let v = (chance * 255.0).round();
    if v <= 0.0 {
        0
    } else if v >= 255.0 {
        255
    } else {
        v as u8
    }
}

fn behavior_kind_from_str(s: &str) -> Result<BehaviorKind, String> {
    match s {
        "bio_plant" => Ok(BehaviorKind::BioPlant),
        "bio_seed" => Ok(BehaviorKind::BioSeed),
        "energy_electricity" => Ok(BehaviorKind::EnergyElectricity),
        "energy_fire" => Ok(BehaviorKind::EnergyFire),
        "energy_spark" => Ok(BehaviorKind::EnergySpark),
        "utility_clone" => Ok(BehaviorKind::UtilityClone),
        "utility_void" => Ok(BehaviorKind::UtilityVoid),
        _ => Err(format!("unknown behavior kind: {}", s)),
    }
}

fn category_from_str(s: &str) -> Result<(CategoryId, ElementFlags), String> {
    match s {
        "solid" => Ok((CAT_SOLID, FLAG_SOLID)),
        "powder" => Ok((CAT_POWDER, FLAG_POWDER)),
        "liquid" => Ok((CAT_LIQUID, FLAG_LIQUID)),
        "gas" => Ok((CAT_GAS, FLAG_GAS)),
        "energy" => Ok((CAT_ENERGY, FLAG_ENERGY)),
        "utility" => Ok((CAT_UTILITY, FLAG_UTILITY)),
        "bio" => Ok((CAT_BIO, FLAG_BIO)),
        _ => Err(format!("unknown category: {}", s)),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleRoot {
    elements: Vec<BundleElement>,
    element_key_to_id: HashMap<String, u16>,
    reactions: Vec<BundleReaction>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleElement {
    id: u16,
    key: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    pack: Option<String>,
    category: String,
    color: u32,
    #[serde(default)]
    density: Option<f64>,
    dispersion: u8,
    lifetime: u16,
    default_temp: f64,
    heat_conductivity: u8,
    bounce: f64,
    friction: f64,
    flags: BundleElementFlags,
    behavior: Option<String>,
    #[serde(default)]
    phase_change: Option<BundlePhaseChange>,
    #[serde(default)]
    hidden: bool,
    #[serde(default)]
    ui: Option<BundleElementUi>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleElementUi {
    category: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    sort: i32,
    #[serde(default)]
    hidden: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleElementFlags {
    flammable: bool,
    conductive: bool,
    corrosive: bool,
    hot: bool,
    cold: bool,
    ignore_gravity: bool,
    rigid: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundlePhaseChange {
    #[serde(default)]
    high: Option<BundlePhaseEndpoint>,
    #[serde(default)]
    low: Option<BundlePhaseEndpoint>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundlePhaseEndpoint {
    temp: f64,
    to_id: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BundleReaction {
    aggressor_id: u16,
    victim_id: u16,
    result_aggressor_id: Option<u16>,
    result_victim_id: u16,
    spawn_id: Option<u16>,
    chance: f64,
}
