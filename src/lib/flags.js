// Feature flags for cnc-web.
//
// DRIVER_EMAILS_ENABLED:
//   Drivers now get every notification through the app (push + in-app bell).
//   The email path is left in place but disabled — flip back to true to
//   re-enable driver-bound email sends without touching call sites.
//   BioTouch and accountant emails are NOT controlled by this flag.
export const DRIVER_EMAILS_ENABLED = true
