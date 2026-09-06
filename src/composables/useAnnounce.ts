//laid at the first use: a live region that appears already holding its text is never read
import { onMounted } from "vue"

let region: HTMLElement | null = null

function install() {
  if (region) return region
  region = document.createElement("div")
  region.setAttribute("aria-live", "polite")
  region.setAttribute("role", "status")
  region.className = "vsui-sr-only"
  document.body.append(region)
  return region
}

//emptied then refilled on the next turn of the loop, never in one frame: a background tab never paints
function say(message: string) {
  const node = install()
  node.textContent = ""
  setTimeout(() => { node.textContent = message })
}

export function useAnnounce() {
  onMounted(install)
  return { announce: say }
}
