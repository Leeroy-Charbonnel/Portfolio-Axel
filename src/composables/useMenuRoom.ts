//a constant ceiling is a guess: 420 px scrolled a menu on a window with 765 free
import { ref } from "vue"

//the window is the edge that counts, not the end of the document
function under(trigger: HTMLElement) {
  return innerHeight - trigger.getBoundingClientRect().bottom
}

//measures the room a menu has below its trigger and flips it up when it does not fit,
//handing the height out as --drop-room. Used by DropSelect
export function useMenuRoom() {
  const room = ref("")
  const upward = ref(false)

  //measured before the panel exists, so it never paints a frame past the fold
  function measure(trigger: HTMLElement) {
    upward.value = false
    room.value = `${under(trigger)}px`
  }

  //the ceiling above is the bottom of a sticky header if there is one, else the window top
  //the trigger is read again: a rectangle from before the opening lands the panel where it no longer is
  function flip(trigger: HTMLElement, panel: HTMLElement) {
    const bar = document.querySelector("header")
    const above = trigger.getBoundingClientRect().top - (bar ? bar.getBoundingClientRect().bottom : 0)
    const below = under(trigger)
    upward.value = panel.scrollHeight > panel.clientHeight && above > below
    room.value = `${upward.value ? above : below}px`
  }

  return { room, upward, measure, flip }
}
