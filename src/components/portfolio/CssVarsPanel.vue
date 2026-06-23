<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue"
import { X, Save, RotateCcw, Shuffle, Smartphone, Monitor } from "lucide-vue-next"
import { useSettings } from "vue-shared-ui"
import { useCssVarsPanel } from "../../composables/useCssVarsPanel"

//SIDE PANEL - groups every editable CSS variable by DOMAIN (Colors,
//Main Project, Gallery, Experience). Each domain has its own "Randomize"
//button that picks a value within the row's min..max for every row in the
//domain. Edits apply to document.documentElement immediately for live
//preview; nothing reaches the DB until the user presses Save. Discard
//reverts to the last-saved snapshot.
//
//RESIZABLE - the user can drag the left edge to widen the panel. When
//the remaining viewport drops under SIMULATE_PHONE_WIDTH_PX, the html
//element gets the .simulate-phone class so component CSS that ALSO
//keys on that selector (style.css + responsive components) flips into
//phone layout. The panel itself flips to "Phone" mode at the same time:
//each row's value is stored under a SEPARATE key (`${key}_mobile`) so
//the author can tune phone-only values without touching desktop.
const PANEL_WIDTH_KEY        = "css-panel.width"
const PANEL_WIDTH_DEFAULT_PX = 448  //matches the old fixed 28rem
const PANEL_WIDTH_MIN_PX     = 280
const SIMULATE_PHONE_WIDTH_PX = 768
const MOBILE_KEY_SUFFIX      = "_mobile"

const { open, hide } = useCssVarsPanel()
const { getString, update, loaded } = useSettings()

type RowType = "text" | "color" | "color-hsl" | "color-accent" | "size" | "unitless" | "int"
type CssVarRow = {
  key:           string
  cssVar:        string
  label:         string
  defaultValue:  string
  //Optional mobile fallback - used as the "Phone" mode default if the
  //author hasn't customised the mobile value yet. Defaults to
  //`defaultValue` (i.e. same as desktop) when missing.
  mobileDefault?: string
  type:          RowType
  group:         string
  unit?:         "px" | "rem" | "%" | "s"  //size rows
  min?:          number
  max?:          number
  step?:         number
}

//ROWS - ordered to match the page scroll order so the panel reads like the
//page itself: foundation colors first, then Home (top of page), Main Project,
//Gallery, Experience, and Nav bar last (side rail). Adding or removing a
//token = just editing this array; the panel is generated on the fly from
//each entry's `type` / `unit` / `min` / `max` / `step`.
const ROWS: CssVarRow[] = [
  //COLORS - global. Accent is special: stored as hex under the existing
  //accent_color setting (so it survives a panel refresh and keeps working
  //with useAccent() in other pages), applied as HSL channels to --primary.
  { group: "Colors", key: "accent_color",       cssVar: "--primary",    label: "Accent",         defaultValue: "#0891b2",   type: "color-accent" },
  { group: "Colors", key: "css_var_background", cssVar: "--background", label: "Background",     defaultValue: "0 0% 0%",   type: "color-hsl" },
  { group: "Colors", key: "css_var_foreground", cssVar: "--foreground", label: "Foreground",     defaultValue: "0 0% 65%",  type: "color-hsl" },
  { group: "Colors", key: "css_var_tag_bg",     cssVar: "--tag-bg",     label: "Tag background", defaultValue: "#ffffff1a", type: "color" },

  //HOME (title screen) - first section the visitor sees
  { group: "Home", key: "css_var_home_grid_size",          cssVar: "--home-grid-size",          label: "Grid cell size",        defaultValue: "50px",    mobileDefault: "30px",   type: "size", unit: "px",  min: 10, max: 200, step: 1 },
  { group: "Home", key: "css_var_home_grid_line_width",    cssVar: "--home-grid-line-width",    label: "Grid line thickness",   defaultValue: "1px",     type: "size", unit: "px",  min: 0, max: 6, step: 1 },
  { group: "Home", key: "css_var_home_grid_drift",         cssVar: "--home-grid-drift-speed",   label: "Grid drift speed",      defaultValue: "20s",     type: "size", unit: "s",   min: 5, max: 60, step: 1 },
  { group: "Home", key: "css_var_home_title_size",         cssVar: "--home-title-size",         label: "Title font size",       defaultValue: "5rem",    mobileDefault: "2.4rem", type: "size", unit: "rem", min: 1, max: 12, step: 0.1 },
  { group: "Home", key: "css_var_home_subtitle_size",      cssVar: "--home-subtitle-size",      label: "Subtitle font size",    defaultValue: "2rem",    mobileDefault: "1.2rem", type: "size", unit: "rem", min: 0.5, max: 5, step: 0.1 },
  { group: "Home", key: "css_var_home_role_size",          cssVar: "--home-role-size",          label: "Role font size",        defaultValue: "1.2rem",  mobileDefault: "0.9rem", type: "size", unit: "rem", min: 0.5, max: 3, step: 0.05 },
  { group: "Home", key: "css_var_home_container_margin",   cssVar: "--home-container-margin",   label: "Container margin",      defaultValue: "170px",   mobileDefault: "20px",   type: "size", unit: "px",  min: 0, max: 400, step: 2 },
  { group: "Home", key: "css_var_home_content_gap",        cssVar: "--home-content-gap",        label: "Content gap",           defaultValue: "1rem",    type: "size", unit: "rem", min: 0, max: 6, step: 0.05 },
  { group: "Home", key: "css_var_home_arrow_delay",        cssVar: "--home-arrow-delay",        label: "Scroll arrow delay",    defaultValue: "1.5s",    type: "size", unit: "s",   min: 0, max: 10, step: 0.1 },

  //MAIN PROJECT - second section
  { group: "Main Project", key: "css_var_mp_padding_y",         cssVar: "--mp-padding-y",         label: "Vertical padding",       defaultValue: "4rem",    mobileDefault: "2rem",    type: "size", unit: "rem", min: 0, max: 12, step: 0.25 },
  { group: "Main Project", key: "css_var_mp_margin_bottom",     cssVar: "--mp-margin-bottom",     label: "Margin between",         defaultValue: "10rem",   mobileDefault: "4rem",    type: "size", unit: "rem", min: 0, max: 20, step: 0.5 },
  { group: "Main Project", key: "css_var_mp_section_gap",       cssVar: "--mp-section-gap",       label: "Section gap",            defaultValue: "3rem",    mobileDefault: "1.5rem",  type: "size", unit: "rem", min: 0, max: 10, step: 0.25 },
  { group: "Main Project", key: "css_var_mp_title_size",        cssVar: "--mp-title-size",        label: "Title size",             defaultValue: "2.5rem",  mobileDefault: "1.4rem",  type: "size", unit: "rem", min: 0.5, max: 6, step: 0.1 },
  { group: "Main Project", key: "css_var_mp_number_size",       cssVar: "--mp-number-size",       label: "Number watermark size",  defaultValue: "6rem",    mobileDefault: "2.5rem",  type: "size", unit: "rem", min: 1, max: 16, step: 0.25 },
  { group: "Main Project", key: "css_var_mp_description_size",  cssVar: "--mp-description-size",  label: "Description font size",  defaultValue: "1rem",    mobileDefault: "0.9rem",  type: "size", unit: "rem", min: 0.5, max: 2.5, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_description_lh",    cssVar: "--mp-description-lh",    label: "Description line-height",defaultValue: "1.75",    type: "unitless",         min: 1, max: 3, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_stat_value_size",   cssVar: "--mp-stat-value-size",   label: "Stat value size",        defaultValue: "2rem",    mobileDefault: "1.2rem",  type: "size", unit: "rem", min: 0.5, max: 5, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_stat_badge_size",   cssVar: "--mp-stat-badge-size",   label: "Stat badge size",        defaultValue: "2rem",    mobileDefault: "1.4rem",  type: "size", unit: "rem", min: 1, max: 4, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_stat_gap",          cssVar: "--mp-stat-gap",          label: "Stat row gap",           defaultValue: "1rem",    mobileDefault: "0.5rem",  type: "size", unit: "rem", min: 0, max: 4, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_thumb_strip_width", cssVar: "--mp-thumb-strip-width", label: "Thumbnail strip width",  defaultValue: "16%",     type: "size", unit: "%",   min: 5, max: 40, step: 1 },
  { group: "Main Project", key: "css_var_mp_thumb_gap",         cssVar: "--mp-thumb-gap",         label: "Thumbnail gap",          defaultValue: "0.4rem",  type: "size", unit: "rem", min: 0, max: 2, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_thumb_bg",          cssVar: "--mp-thumb-bg",          label: "Thumbnail strip bg",     defaultValue: "#ffffff1a", type: "color" },
  { group: "Main Project", key: "css_var_mp_software_size",     cssVar: "--mp-software-size",     label: "Software pill size",     defaultValue: "0.8rem",  mobileDefault: "0.7rem",  type: "size", unit: "rem", min: 0.5, max: 1.5, step: 0.05 },
  { group: "Main Project", key: "css_var_mp_details_gap",       cssVar: "--mp-details-gap",       label: "Description-stats gap",  defaultValue: "4rem",    mobileDefault: "1rem",    type: "size", unit: "rem", min: 0, max: 10, step: 0.25 },

  //GALLERY - third section
  { group: "Gallery", key: "css_var_gallery_columns",         cssVar: "--gallery-columns",         label: "Columns",         defaultValue: "3",      mobileDefault: "2",       type: "int",                min: 1, max: 6, step: 1 },
  { group: "Gallery", key: "css_var_gallery_gap",             cssVar: "--gallery-gap",             label: "Grid gap",        defaultValue: "2rem",   mobileDefault: "0.75rem", type: "size", unit: "rem", min: 0, max: 6, step: 0.1 },
  { group: "Gallery", key: "css_var_gallery_card_padding",    cssVar: "--gallery-card-padding",    label: "Card padding",    defaultValue: "1rem",   mobileDefault: "0.6rem",  type: "size", unit: "rem", min: 0, max: 3, step: 0.05 },
  { group: "Gallery", key: "css_var_gallery_title_size",      cssVar: "--gallery-title-size",      label: "Title size",      defaultValue: "1.2rem", mobileDefault: "0.95rem", type: "size", unit: "rem", min: 0.5, max: 3, step: 0.05 },
  { group: "Gallery", key: "css_var_gallery_stat_size",       cssVar: "--gallery-stat-size",       label: "Stat font size",  defaultValue: "0.9rem", mobileDefault: "0.7rem",  type: "size", unit: "rem", min: 0.5, max: 1.5, step: 0.05 },
  { group: "Gallery", key: "css_var_gallery_stat_badge_size", cssVar: "--gallery-stat-badge-size", label: "Stat badge size", defaultValue: "1.5rem", mobileDefault: "1.1rem",  type: "size", unit: "rem", min: 0.75, max: 3, step: 0.05 },

  //EXPERIENCE - fourth section (timeline at the bottom)
  { group: "Experience", key: "css_var_exp_period_column",        cssVar: "--exp-period-column",        label: "Period column width", defaultValue: "8rem",   type: "size", unit: "rem", min: 4, max: 18, step: 0.25 },
  { group: "Experience", key: "css_var_exp_grid_gap",             cssVar: "--exp-grid-gap",             label: "Grid gap",            defaultValue: "1rem",   type: "size", unit: "rem", min: 0, max: 4, step: 0.05 },
  { group: "Experience", key: "css_var_exp_item_gap",             cssVar: "--exp-item-gap",             label: "Gap between items",   defaultValue: "3rem",   type: "size", unit: "rem", min: 0, max: 10, step: 0.25 },
  { group: "Experience", key: "css_var_exp_content_padding_left", cssVar: "--exp-content-padding-left", label: "Content padding-left",defaultValue: "2rem",   type: "size", unit: "rem", min: 0, max: 5, step: 0.05 },
  { group: "Experience", key: "css_var_exp_title_size",           cssVar: "--exp-title-size",           label: "Title size",          defaultValue: "1.5rem", type: "size", unit: "rem", min: 0.5, max: 3, step: 0.05 },
  { group: "Experience", key: "css_var_exp_company_size",         cssVar: "--exp-company-size",         label: "Company size",        defaultValue: "1.2rem", type: "size", unit: "rem", min: 0.5, max: 2.5, step: 0.05 },
  { group: "Experience", key: "css_var_exp_bullet_gap",           cssVar: "--exp-bullet-gap",           label: "Bullet gap",          defaultValue: "0.4rem", type: "size", unit: "rem", min: 0, max: 2, step: 0.05 },
  { group: "Experience", key: "css_var_exp_line_height",          cssVar: "--exp-line-height",          label: "Line height",         defaultValue: "1.6",    type: "unitless",         min: 1, max: 3, step: 0.05 },

  //NAV BAR (side nav) - always-visible rail, last in the panel
  { group: "Nav bar", key: "css_var_nav_font_size",   cssVar: "--nav-font-size",   label: "Font size",   defaultValue: "0.8rem", mobileDefault: "0.7rem", type: "size", unit: "rem", min: 0.5, max: 1.6, step: 0.05 },
  { group: "Nav bar", key: "css_var_nav_gap",         cssVar: "--nav-gap",         label: "Link gap",    defaultValue: "1.5rem", mobileDefault: "0.6rem", type: "size", unit: "rem", min: 0, max: 6, step: 0.05 },
  { group: "Nav bar", key: "css_var_nav_left",        cssVar: "--nav-left",        label: "Left offset", defaultValue: "1rem",   type: "size", unit: "rem", min: 0, max: 6, step: 0.05 },
  { group: "Nav bar", key: "css_var_nav_font_weight", cssVar: "--nav-font-weight", label: "Font weight", defaultValue: "700",    type: "int",               min: 100, max: 900, step: 100 },
]

//Two value maps - desktop and phone - so the author can tune each mode
//independently. The ACTIVE mode is whichever matches the website area
//width (auto) or whichever the user pinned via the desktop/phone toggle.
//savedValues holds whatever was persisted on the server (per mode).
const savedDesktop = ref<Record<string, string>>({})
const savedMobile  = ref<Record<string, string>>({})
const localDesktop = ref<Record<string, string>>({})
const localMobile  = ref<Record<string, string>>({})

//===========================================================================
//RESIZABLE PANEL + AUTO PHONE-MODE
//===========================================================================
const panelWidth = ref<number>(loadPanelWidth())
//User can force a mode via the header buttons; null = follow auto.
const modeOverride = ref<"desktop" | "phone" | null>(null)
const windowWidth = ref<number>(typeof window !== "undefined" ? window.innerWidth : 1920)

function loadPanelWidth(): number {
  if (typeof localStorage === "undefined") return PANEL_WIDTH_DEFAULT_PX
  const raw = localStorage.getItem(PANEL_WIDTH_KEY)
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= PANEL_WIDTH_MIN_PX ? n : PANEL_WIDTH_DEFAULT_PX
}

function persistPanelWidth(w: number) {
  try { localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(w))) } catch { /*ignore*/ }
}

//Width available for the page content next to the panel. When this drops
//under SIMULATE_PHONE_WIDTH_PX we flip the document into simulate-phone
//mode so component CSS that keys on .simulate-phone fires.
const availableWidth = computed(() => Math.max(0, windowWidth.value - panelWidth.value))
const autoPhoneMode  = computed(() => availableWidth.value < SIMULATE_PHONE_WIDTH_PX)
const phoneMode      = computed(() =>
  modeOverride.value === null ? autoPhoneMode.value : modeOverride.value === "phone",
)

//Mode-aware accessors so the rest of the script doesn't have to branch.
function localValues(): Record<string, string> { return phoneMode.value ? localMobile.value  : localDesktop.value }
function savedValues(): Record<string, string> { return phoneMode.value ? savedMobile.value  : savedDesktop.value }
function rowDefault(row: CssVarRow): string    { return phoneMode.value ? (row.mobileDefault ?? row.defaultValue) : row.defaultValue }
function rowKey(row: CssVarRow): string        { return phoneMode.value ? row.key + MOBILE_KEY_SUFFIX : row.key }

function loadSaved() {
  const nextD: Record<string, string> = {}
  const nextM: Record<string, string> = {}
  for (const row of ROWS) {
    nextD[row.key] = getString(row.key, row.defaultValue)
    nextM[row.key] = getString(row.key + MOBILE_KEY_SUFFIX, row.mobileDefault ?? row.defaultValue)
  }
  savedDesktop.value = { ...nextD }; localDesktop.value = { ...nextD }
  savedMobile.value  = { ...nextM }; localMobile.value  = { ...nextM }
  applyAll()
}

function applyToRoot(row: CssVarRow, raw: string) {
  if (row.type === "color-accent") {
    //accent is stored as #rrggbb but --primary expects shadcn channel
    //format "H S% L%" - convert on the fly so the live preview matches
    //what useAccent() applies after save
    document.documentElement.style.setProperty(row.cssVar, hexToHsl(raw))
  } else {
    document.documentElement.style.setProperty(row.cssVar, raw)
  }
}

function applyAll() {
  //Active mode's values win - desktop tokens flow normally, phone tokens
  //also override the same root variable so the site reacts as if it were
  //actually rendered at phone width.
  const values = localValues()
  for (const row of ROWS) applyToRoot(row, values[row.key] ?? rowDefault(row))
}

function onInput(row: CssVarRow, raw: string) {
  localValues()[row.key] = raw
  applyToRoot(row, raw)
}

function resetRow(row: CssVarRow) { onInput(row, rowDefault(row)) }

//Randomize every numeric row in a domain. Color rows are left alone (the
//user picks them deliberately, randomizing them just yields visual noise).
function randomizeGroup(groupName: string) {
  for (const row of ROWS) {
    if (row.group !== groupName) continue
    if (row.type === "color" || row.type === "color-hsl" || row.type === "text") continue
    const min  = row.min  ?? 0
    const max  = row.max  ?? 1
    const step = row.step ?? 0.01
    const range = max - min
    const steps = Math.max(1, Math.round(range / step))
    const rnd = min + step * Math.floor(Math.random() * (steps + 1))
    const decimals = (step.toString().split(".")[1] || "").length
    const num = rnd.toFixed(decimals)
    if (row.type === "size")     onInput(row, `${num}${row.unit ?? ""}`)
    else if (row.type === "int") onInput(row, `${Math.round(rnd)}`)
    else                         onInput(row, `${num}`)
  }
}

//Dirty status spans BOTH modes - a save commits whatever has changed in
//either bucket. We don't want the author to lose phone tweaks just
//because they were viewing the desktop tab.
const dirty = computed(() => {
  for (const row of ROWS) {
    if (localDesktop.value[row.key] !== savedDesktop.value[row.key]) return true
    if (localMobile.value[row.key]  !== savedMobile.value[row.key])  return true
  }
  return false
})

async function save() {
  for (const row of ROWS) {
    const nextD = localDesktop.value[row.key]
    if (nextD !== savedDesktop.value[row.key]) {
      try {
        await update(row.key, nextD, {
          type:        "string",
          group:       "css-vars",
          description: `CSS variable ${row.cssVar} (desktop)`,
        })
      } catch (err) {
        console.error(`[css-panel] save ${row.key} failed:`, err)
      }
    }
    const nextM = localMobile.value[row.key]
    if (nextM !== savedMobile.value[row.key]) {
      try {
        await update(row.key + MOBILE_KEY_SUFFIX, nextM, {
          type:        "string",
          group:       "css-vars",
          description: `CSS variable ${row.cssVar} (phone)`,
        })
      } catch (err) {
        console.error(`[css-panel] save ${row.key}${MOBILE_KEY_SUFFIX} failed:`, err)
      }
    }
  }
  savedDesktop.value = { ...localDesktop.value }
  savedMobile.value  = { ...localMobile.value }
}

function discard() {
  localDesktop.value = { ...savedDesktop.value }
  localMobile.value  = { ...savedMobile.value }
  applyAll()
}

const confirming = ref(false)

function tryClose() {
  if (dirty.value) { confirming.value = true; return }
  hide()
}

function confirmDiscardAndClose() {
  discard()
  confirming.value = false
  hide()
}

function cancelClose() { confirming.value = false }

watch(dirty, (val) => { if (!val) confirming.value = false })

function sizeNumber(row: CssVarRow): number {
  const raw = localValues()[row.key] ?? rowDefault(row)
  return parseFloat(raw) || 0
}

function onSizeInput(row: CssVarRow, n: string) {
  onInput(row, `${n}${row.unit ?? ""}`)
}

function onUnitlessInput(row: CssVarRow, n: string) { onInput(row, n) }
function onIntInput(row: CssVarRow, n: string)      { onInput(row, `${Math.round(parseFloat(n))}`) }

function hexToHsl(hex: string): string {
  const m = hex.replace("#", "")
  if (m.length !== 6) return "0 0% 0%"
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2); break
      case b: h = ((r - g) / d + 4); break
    }
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

function hslToHex(hsl: string): string {
  const m = hsl.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/)
  if (!m) return "#000000"
  const h = parseFloat(m[1]) / 360
  const s = parseFloat(m[2]) / 100
  const l = parseFloat(m[3]) / 100
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number, g: number, b: number
  if (s === 0) { r = g = b = l }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function colorHex(row: CssVarRow): string {
  const raw = localValues()[row.key] ?? rowDefault(row)
  if (row.type === "color-hsl")    return hslToHex(raw)
  if (row.type === "color-accent") return raw    //already a hex string
  const match = raw.match(/#[0-9a-fA-F]{6}/)
  return match ? match[0] : "#ffffff"
}

function onColorInput(row: CssVarRow, hex: string) {
  if (row.type === "color-hsl")    onInput(row, hexToHsl(hex))
  else if (row.type === "color-accent") onInput(row, hex)   //store hex; applyToRoot does the channel conversion
  else                              onInput(row, hex)
}

//Group rows preserving declaration order, with a flag telling us whether
//"Randomize" applies (any non-color row in the group)
const grouped = computed(() => {
  const out: { group: string; rows: CssVarRow[]; canRandomize: boolean }[] = []
  for (const row of ROWS) {
    const existing = out.find((g) => g.group === row.group)
    if (existing) existing.rows.push(row)
    else out.push({ group: row.group, rows: [row], canRandomize: false })
  }
  for (const g of out) {
    g.canRandomize = g.rows.some((r) => r.type === "size" || r.type === "unitless" || r.type === "int")
  }
  return out
})

watch(open, (val) => {
  document.documentElement.classList.toggle("css-panel-open", val)
  if (val && loaded.value) loadSaved()
  //panel-width var on the root so the rest of the app can offset for it
  if (val) document.documentElement.style.setProperty("--panel-width", `${panelWidth.value}px`)
  else     document.documentElement.style.removeProperty("--panel-width")
  syncPhoneClass()
})

watch(loaded, () => { if (loaded.value) loadSaved() })

//===========================================================================
//RESIZE INTERACTION - drag the left edge of the panel
//===========================================================================
const dragging = ref(false)

function onResizeStart(e: PointerEvent) {
  if (!open.value) return
  dragging.value = true
  document.body.style.cursor = "col-resize"
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  e.preventDefault()
}

function onResizeMove(e: PointerEvent) {
  if (!dragging.value) return
  const next = Math.max(PANEL_WIDTH_MIN_PX, window.innerWidth - e.clientX)
  panelWidth.value = next
  document.documentElement.style.setProperty("--panel-width", `${next}px`)
}

function onResizeEnd(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  document.body.style.cursor = ""
  ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  persistPanelWidth(panelWidth.value)
}

//===========================================================================
//PHONE-MODE BRIDGE - keep the html class + active values in sync.
//===========================================================================
function syncPhoneClass() {
  document.documentElement.classList.toggle("simulate-phone", open.value && phoneMode.value)
}

//Apply the active mode's values + flip the html class whenever either
//the auto-detection (window or panel resize) or the manual override flips.
watch(phoneMode, () => {
  syncPhoneClass()
  if (loaded.value) applyAll()
})

function onWindowResize() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener("resize", onWindowResize)
  if (loaded.value) loadSaved()
  syncPhoneClass()
})

onBeforeUnmount(() => {
  window.removeEventListener("resize", onWindowResize)
  document.documentElement.classList.remove("css-panel-open")
  document.documentElement.classList.remove("simulate-phone")
  document.documentElement.style.removeProperty("--panel-width")
})
</script>

<template>
  <Teleport to="body">
    <Transition name="css-panel">
      <aside
        v-if="open"
        class="css-panel"
        role="dialog"
        aria-label="Global CSS variables editor"
        :style="{ width: `${panelWidth}px` }"
      >
        <!--Resize handle on the LEFT edge (panel is anchored right)-->
        <div
          class="css-panel__resize"
          aria-hidden="true"
          @pointerdown="onResizeStart"
          @pointermove="onResizeMove"
          @pointerup="onResizeEnd"
          @pointercancel="onResizeEnd"
        ></div>

        <header class="css-panel__header">
          <template v-if="!confirming">
            <h2
              class="css-panel__title"
              :class="{ 'css-panel__title--phone': phoneMode }"
            >
              CSS variables
              <span class="css-panel__title-mode">{{ phoneMode ? "Phone" : "Desktop" }}</span>
            </h2>
            <!--Mode toggle - Desktop / Phone. Null override = follows the
            auto detection (panel width vs viewport). The label dot below
            shows which mode is currently active.-->
            <div class="css-panel__mode-toggle" role="group" aria-label="Mode">
              <button
                type="button"
                class="css-panel__mode-btn"
                :class="{ 'css-panel__mode-btn--active': !phoneMode }"
                :title="autoPhoneMode ? 'Pin desktop (auto says phone)' : 'Desktop mode'"
                @click="modeOverride = modeOverride === 'desktop' ? null : 'desktop'"
              >
                <Monitor :size="13" />
              </button>
              <button
                type="button"
                class="css-panel__mode-btn"
                :class="{ 'css-panel__mode-btn--active': phoneMode }"
                :title="autoPhoneMode ? 'Phone mode (auto)' : 'Pin phone (override desktop)'"
                @click="modeOverride = modeOverride === 'phone' ? null : 'phone'"
              >
                <Smartphone :size="13" />
              </button>
            </div>
            <button
              type="button"
              class="css-panel__close"
              aria-label="Close"
              @click="tryClose"
            >
              <X :size="16" />
            </button>
          </template>
          <template v-else>
            <span class="css-panel__confirm-label">Discard unsaved changes?</span>
            <div class="css-panel__confirm-actions">
              <button type="button" class="css-panel__btn" @click="cancelClose">
                Cancel
              </button>
              <button type="button" class="css-panel__btn css-panel__btn--primary" @click="confirmDiscardAndClose">
                Discard
              </button>
            </div>
          </template>
        </header>

        <div class="css-panel__body">
          <div v-for="g in grouped" :key="g.group" class="css-panel__group">
            <div class="css-panel__group-head">
              <h3 class="css-panel__group-title">{{ g.group }}</h3>
              <button
                v-if="g.canRandomize"
                type="button"
                class="css-panel__group-random"
                :title="`Randomize ${g.group}`"
                @click="randomizeGroup(g.group)"
              >
                <Shuffle :size="12" />
                <span>Random</span>
              </button>
            </div>

            <div
              v-for="row in g.rows"
              :key="row.key"
              class="css-panel__row"
              :class="{ 'css-panel__row--dirty': localValues()[row.key] !== savedValues()[row.key] }"
            >
              <div class="css-panel__row-head">
                <span class="css-panel__row-label">{{ row.label }}</span>
                <button
                  type="button"
                  class="css-panel__reset"
                  :title="`Reset to ${rowDefault(row)}`"
                  @click="resetRow(row)"
                >
                  <RotateCcw :size="11" />
                </button>
              </div>

              <div class="css-panel__row-control">
                <template v-if="row.type === 'color' || row.type === 'color-hsl' || row.type === 'color-accent'">
                  <input
                    type="color"
                    class="css-panel__color"
                    :value="colorHex(row)"
                    @input="(e) => onColorInput(row, (e.target as HTMLInputElement).value)"
                  />
                  <input
                    class="css-panel__text"
                    type="text"
                    :value="localValues()[row.key] ?? rowDefault(row)"
                    @input="(e) => onInput(row, (e.target as HTMLInputElement).value)"
                  />
                </template>

                <template v-else-if="row.type === 'size'">
                  <input
                    type="range"
                    class="css-panel__slider"
                    :min="row.min"
                    :max="row.max"
                    :step="row.step"
                    :value="sizeNumber(row)"
                    @input="(e) => onSizeInput(row, (e.target as HTMLInputElement).value)"
                  />
                  <span class="css-panel__readout">{{ sizeNumber(row) }}{{ row.unit }}</span>
                </template>

                <template v-else-if="row.type === 'unitless'">
                  <input
                    type="range"
                    class="css-panel__slider"
                    :min="row.min"
                    :max="row.max"
                    :step="row.step"
                    :value="parseFloat(localValues()[row.key] ?? rowDefault(row)) || 0"
                    @input="(e) => onUnitlessInput(row, (e.target as HTMLInputElement).value)"
                  />
                  <span class="css-panel__readout">{{ localValues()[row.key] ?? rowDefault(row) }}</span>
                </template>

                <template v-else-if="row.type === 'int'">
                  <input
                    type="range"
                    class="css-panel__slider"
                    :min="row.min"
                    :max="row.max"
                    :step="row.step"
                    :value="parseInt(localValues()[row.key] ?? rowDefault(row), 10) || 0"
                    @input="(e) => onIntInput(row, (e.target as HTMLInputElement).value)"
                  />
                  <span class="css-panel__readout">{{ localValues()[row.key] ?? rowDefault(row) }}</span>
                </template>

                <template v-else>
                  <input
                    class="css-panel__text"
                    type="text"
                    :value="localValues()[row.key] ?? rowDefault(row)"
                    :placeholder="rowDefault(row)"
                    @input="(e) => onInput(row, (e.target as HTMLInputElement).value)"
                  />
                </template>
              </div>
            </div>
          </div>
        </div>

        <footer class="css-panel__footer">
          <span
            class="css-panel__dirty-flag"
            :class="{ 'css-panel__dirty-flag--on': dirty }"
          >
            {{ dirty ? "Unsaved" : "Saved" }}
          </span>
          <div class="css-panel__actions">
            <button
              type="button"
              class="css-panel__btn"
              :disabled="!dirty"
              @click="discard"
            >
              <RotateCcw :size="13" />
              <span>Discard</span>
            </button>
            <button
              type="button"
              class="css-panel__btn css-panel__btn--primary"
              :disabled="!dirty"
              @click="save"
            >
              <Save :size="13" />
              <span>Save</span>
            </button>
          </div>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
/*PANEL LOCK - re-declares every editable var on .css-panel itself so the
panel uses fixed defaults regardless of what the user drags on the global
:root. Derived tokens (--color-background, --color-text, etc.) recompute
against these locals so the panel never morphs along with its own edits.
--color-accent is left inherited so the dirty indicator and primary button
still track the user's accent choice.*/
.css-panel {
  --background:       0 0% 0%;
  --foreground:       0 0% 65%;
  --tag-bg:           hsl(0 0% 100% / 0.1);
  --spacing-xxs:      0.25rem;
  --spacing-xs:       0.4rem;
  --spacing-sm:       0.75rem;
  --spacing-md:       1rem;
  --spacing-lg:       1.5rem;
  --spacing-xl:       2rem;
  --spacing-2xl:      3rem;
  --spacing-3xl:      4rem;
  --font-size-xs:     0.8rem;
  --font-size-sm:     0.9rem;
  --font-size-base:   1rem;
  --font-size-md:     1.2rem;
  --font-size-lg:     1.5rem;
  --font-size-xl:     2rem;
  --font-size-2xl:    2.5rem;
  --border-width-sm:  1px;
  --border-width-md:  2px;
  --grain-opacity:    0.12;
  --filter-blur:      6px;

  position: fixed;
  top:    0;
  right:  0;
  bottom: 0;
  /*Inline `width: ${panelWidth}px` is set by the component; the var
  fallback covers the (rare) case where the inline style isn't applied
  yet on first paint.*/
  width: var(--panel-width, 28rem);
  min-width: 280px;
  max-width: 95vw;
  z-index: 9990;
  display: flex;
  flex-direction: column;
  background-color: hsl(0 0% 0%);
  border-left: 1px solid hsl(0 0% 20%);
}

/*Resize handle - thin invisible grab strip on the LEFT edge of the panel
(since the panel is anchored right). Pointer events propagate to the
script handlers which update --panel-width live and persist on release.*/
.css-panel__resize {
  position: absolute;
  top: 0; bottom: 0;
  left: 0;
  width: 6px;
  margin-left: -3px;   /*half outside the panel so the hit area is centered*/
  cursor: col-resize;
  z-index: 2;
  background-color: transparent;
  transition: background-color 0.15s ease;
}
.css-panel__resize:hover,
.css-panel__resize:active {
  background-color: var(--color-accent);
}

.css-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
}

.css-panel__title {
  display: inline-flex;
  align-items: baseline;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-hover);
  transition: color 0.15s ease;
}

/*Phone-mode tint - title glows accent so it's obvious which value set
the panel is currently editing without checking the toggle buttons.*/
.css-panel__title--phone { color: var(--color-accent); }

.css-panel__title-mode {
  padding: 0 var(--spacing-xs);
  border: var(--border-width-sm) solid currentColor;
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-tight);
  opacity: 0.85;
}

.css-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-lg);
  height: var(--spacing-lg);
  background-color: transparent;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.css-panel__close:hover { color: var(--color-text-hover); }

/*Desktop / Phone mode toggle - segmented control at the right of the
header. Active button is filled with --tag-bg; inactive ones are flat.*/
.css-panel__mode-toggle {
  display: inline-flex;
  margin-left: auto;
  border: var(--border-width-sm) solid var(--color-gray-medium);
}
.css-panel__mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-xl);
  height: var(--spacing-lg);
  background-color: transparent;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.css-panel__mode-btn:hover { color: var(--color-text-hover); }
.css-panel__mode-btn--active {
  color: var(--color-text-hover);
  background-color: var(--tag-bg);
}

.css-panel__confirm-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-accent);
}

.css-panel__confirm-actions {
  display: inline-flex;
  gap: var(--spacing-xs);
}

.css-panel__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--spacing-md) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.css-panel__group { display: flex; flex-direction: column; gap: var(--spacing-sm); }

.css-panel__group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-xxs);
}

.css-panel__group-title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}

.css-panel__group-random {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xxs);
  padding: var(--spacing-xxs) var(--spacing-sm);
  background-color: transparent;
  border: none;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: color 0.15s ease;
}

.css-panel__group-random:hover { color: var(--color-accent); }

.css-panel__row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xxs);
  padding: var(--spacing-xs) 0;
}

.css-panel__row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xs);
}

.css-panel__row-label {
  font-size: var(--font-size-xs);
  color: var(--color-text);
  letter-spacing: var(--letter-spacing-tight);
}

.css-panel__row--dirty .css-panel__row-label { color: var(--color-accent); }

.css-panel__reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width:  var(--spacing-md);
  height: var(--spacing-md);
  background-color: transparent;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.css-panel__row:hover .css-panel__reset,
.css-panel__row--dirty .css-panel__reset { opacity: 1; }

.css-panel__reset:hover { color: var(--color-accent); }

.css-panel__row-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.css-panel__color {
  width:  var(--spacing-lg);
  height: var(--spacing-lg);
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}
.css-panel__color::-webkit-color-swatch-wrapper { padding: 0; }
.css-panel__color::-webkit-color-swatch { border: none; }
.css-panel__color::-moz-color-swatch     { border: none; }

.css-panel__text {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--spacing-xxs) 0;
  background-color: transparent;
  border: none;
  border-bottom: var(--border-width-sm) solid var(--color-gray-medium);
  color: var(--color-text-hover);
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  font-size: var(--font-size-xs);
}

.css-panel__text:focus {
  outline: none;
  border-bottom-color: var(--color-accent);
}

.css-panel__slider {
  flex: 1 1 auto;
  min-width: 0;
  height: 2px;
  background: var(--color-gray-medium);
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  outline: none;
}

.css-panel__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width:  12px;
  height: 12px;
  background: var(--color-accent);
  cursor: pointer;
  border: none;
}

.css-panel__slider::-moz-range-thumb {
  width:  12px;
  height: 12px;
  background: var(--color-accent);
  cursor: pointer;
  border: none;
}

.css-panel__readout {
  font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  min-width: 4.5rem;
  text-align: right;
}

.css-panel__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  border-top: var(--border-width-sm) solid var(--color-gray-medium);
}

.css-panel__dirty-flag {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-text-tertiary);
}

.css-panel__dirty-flag--on { color: var(--color-accent); }

.css-panel__actions { display: inline-flex; gap: var(--spacing-xs); }

.css-panel__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background-color: transparent;
  border: none;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: color 0.15s ease;
}

.css-panel__btn:hover:not(:disabled) { color: var(--color-text-hover); }
.css-panel__btn--primary:not(:disabled) { color: var(--color-accent); }
.css-panel__btn--primary:hover:not(:disabled) { color: var(--color-text-hover); }
.css-panel__btn:disabled { opacity: 0.3; cursor: not-allowed; }

.css-panel-enter-active,
.css-panel-leave-active { transition: transform 0.2s ease; }
.css-panel-enter-from,
.css-panel-leave-to     { transform: translateX(100%); }
</style>
