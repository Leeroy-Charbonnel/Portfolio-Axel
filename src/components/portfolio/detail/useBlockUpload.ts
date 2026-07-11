import { ref } from "vue"
import { usePortfolio } from "../../../composables/usePortfolio"

//SHARED UPLOAD - the one file-picking + uploading path every detail-page
//block editor uses (image, video, carousel, marquee, compare). Nothing
//block-specific here: pick native files, push them through the portfolio
//uploadFile (which routes to the prod volume and toasts on failure),
//return the created rows. Callers write the ids/urls into their content.

const uploading = ref(false)

function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export function useBlockUpload() {
  const { uploadFile } = usePortfolio()

  //Pick then upload. Returns [] when the picker is cancelled or the
  //upload fails (uploadFile already toasts + logs the failure).
  async function pickAndUpload(accept: string, multiple = false): Promise<{ id: string; url: string }[]> {
    const files = await pickFiles(accept, multiple)
    if (!files.length) return []
    uploading.value = true
    try {
      const rows: { id: string; url: string }[] = []
      for (const f of files) rows.push(await uploadFile(f))
      return rows
    } catch {
      //already surfaced by uploadFile's toast - return what succeeded (nothing)
      return []
    } finally {
      uploading.value = false
    }
  }

  return { uploading, pickAndUpload }
}
