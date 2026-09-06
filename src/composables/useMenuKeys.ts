import { nextTick, ref, useId, watch, type Ref } from "vue"

//keyboard for a listbox or menu panel: arrows, Home/End, Escape, type-ahead, and focus
//returned to the opener on close. Used by DropSelect
const TYPEAHEAD_MS = 500

const ROW = "button:not([disabled]), a[href], input:not([disabled]):not([type=hidden])"
//a block that answers its own keys, e.g. a slider inside the panel
const SKIP = "[data-menu-skip]"
const BAND = `${SKIP} [tabindex="0"]`
const FIELD_KEEPS = ["ArrowDown", "ArrowUp", "Escape", "Tab"]

//an event aimed at a field is left to the field, save for the keys the menu still needs
function writing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable
}

export function useMenuKeys(open: Ref<unknown>, close: () => void) {
  const panelId = useId()
  const panel = ref<HTMLElement | null>(null)
  let opener: HTMLElement | null = null
  let typed = ""
  let typedAt = 0

  //a function ref: inside a v-for a plain ref hands back an array
  //null only once it really left, a menu replacing another gives its element up late
  function hold(el: unknown) {
    if (el instanceof HTMLElement) panel.value = el
    else if (panel.value && !panel.value.isConnected) panel.value = null
  }

  //focus() does nothing on a hidden row, so four presses in a row moved nothing
  function rows(): HTMLElement[] {
    if (!panel.value) return []
    return [...panel.value.querySelectorAll<HTMLElement>(`${ROW}, ${BAND}`)]
      .filter(row => row.checkVisibility({ visibilityProperty: true }))
  }

  //scrollIntoView leaves inline at "nearest", which slides the page sideways to reach a panel that overflows
  function reveal(row: HTMLElement) {
    const stop = panel.value
    if (!stop) return
    for (let box = row.parentElement; box && stop.contains(box); box = box.parentElement) {
      if (!/auto|scroll/.test(getComputedStyle(box).overflowY)) continue
      const seen = box.getBoundingClientRect()
      const mine = row.getBoundingClientRect()
      if (mine.top < seen.top) box.scrollTop += mine.top - seen.top
      else if (mine.bottom > seen.bottom) box.scrollTop += mine.bottom - seen.bottom
      return
    }
  }

  //preventScroll: a panel opened at the fold dragged the page hundreds of pixels
  function focusRow(row: HTMLElement) {
    row.focus({ preventScroll: true })
    reveal(row)
  }

  function focusAt(index: number) {
    const list = rows()
    if (list.length === 0) return
    focusRow(list[((index % list.length) + list.length) % list.length]!)
  }

  function move(step: number) {
    const list = rows()
    if (list.length === 0) return
    const from = list.indexOf(document.activeElement as HTMLElement)
    focusAt(from < 0 ? (step > 0 ? 0 : list.length - 1) : from + step)
  }

  function plain(text: string) {
    return text.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  }

  //any word of a row, not just its first: type-ahead reaches "New York" by "y"
  function starts(row: HTMLElement, prefix: string) {
    return plain(row.textContent ?? "").split(/\s+/).some(word => word.startsWith(prefix))
  }

  function jump(letter: string) {
    const now = Date.now()
    typed = now - typedAt > TYPEAHEAD_MS ? letter : typed + letter
    typedAt = now
    //the same letter hammered walks the rows holding it
    const prefix = /^(.)\1+$/.test(typed) ? typed[0]! : typed
    const list = rows()
    const from = list.indexOf(document.activeElement as HTMLElement)
    const order = prefix.length === 1 ? [...list.slice(from + 1), ...list.slice(0, from + 1)] : list
    const hit = order.find(row => starts(row, prefix))
    if (hit) focusRow(hit)
  }

  function onKey(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (writing(event.target) && !FIELD_KEEPS.includes(event.key)) return
    switch (event.key) {
      case "ArrowDown": move(1); break
      case "ArrowUp":   move(-1); break
      case "Home":      focusAt(0); break
      case "End":       focusAt(rows().length - 1); break
      case "Escape":    close(); break
      case "Tab":       move(event.shiftKey ? -1 : 1); break
      case " ": {
        //a button answers a space by itself, a link does not
        const row = document.activeElement
        if (!(row instanceof HTMLAnchorElement)) return
        row.click()
        break
      }
      default:
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
        jump(plain(event.key))
    }
    event.preventDefault()
    //without this a keystroke on an open menu reaches a global shortcut under it
    event.stopPropagation()
  }

  watch(open, async (now, before) => {
    if (!now) {
      //only if the menu still held focus, a click elsewhere has its own target
      if (panel.value?.contains(document.activeElement)) opener?.focus()
      opener = null
      return
    }
    //a menu opened right after another keeps the first opener
    if (!before) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const list = rows()
    if (panel.value?.getAttribute("role") === "menu")
      for (const row of list) if (!row.hasAttribute("role")) row.setAttribute("role", "menuitem")
    const start = list.find(row => row.getAttribute("aria-checked") === "true")
      ?? list.find(row => !row.closest(SKIP))
    if (start) focusRow(start)
  })

  return { panelId, hold, onKey }
}
