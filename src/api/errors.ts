import { ConnectError } from "@connectrpc/connect"
import { ValidationErrorsSchema, type FieldViolation } from "./gen/pipeline_pb.js"

// errorMessage extracts a human-readable message from any thrown value.
// For a ConnectError it returns `rawMessage` — the server text without the
// "[invalid_argument] " code prefix that `.message` carries — falling back to
// the caller-supplied string for network failures or non-Error throws.
export function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof ConnectError) {
        return err.rawMessage || fallback
    }
    if (err instanceof Error && err.message) {
        return err.message
    }
    return fallback
}

// fieldViolations pulls structured per-field validation errors out of a
// ConnectError's details (attached server-side via WithDetails). Returns an
// empty array when there are none, so callers can always iterate safely.
export function fieldViolations(err: unknown): FieldViolation[] {
    if (err instanceof ConnectError) {
        const detail = err.findDetails(ValidationErrorsSchema)[0]
        if (detail) return detail.violations
    }
    return []
}
