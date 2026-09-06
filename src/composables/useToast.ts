import { ref } from "vue"

export type ToastType = "success" | "error" | "info" | "warning"

export interface Toast {
  id:       number
  type:     ToastType
  title?:   string
  message:  string
  duration: number
}

export interface ToastInput {
  type?:    ToastType
  title?:   string
  message:  string
  duration?: number
}

//SHARED STATE - single queue across the whole app
const toasts  = ref<Toast[]>([])
let   nextId  = 1

export function useToast() {
  function show(input: ToastInput): number {
    const toast: Toast = {
      id:       nextId++,
      type:     input.type     ?? "info",
      title:    input.title,
      message:  input.message,
      duration: input.duration ?? 3000,
    }
    toasts.value.push(toast)
    if (toast.duration > 0) {
      setTimeout(() => dismiss(toast.id), toast.duration)
    }
    return toast.id
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  function clear() {
    toasts.value = []
  }

  //CONVENIENCE HELPERS
  const success = (message: string, title?: string) => show({ type: "success", message, title })
  const error   = (message: string, title?: string) => show({ type: "error",   message, title })
  const info    = (message: string, title?: string) => show({ type: "info",    message, title })
  const warning = (message: string, title?: string) => show({ type: "warning", message, title })

  return { toasts, show, dismiss, clear, success, error, info, warning }
}
