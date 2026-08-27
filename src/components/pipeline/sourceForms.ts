// source *variant key* -> guided form component.
//
// Keyed by `PipelineSource.key`, not by the proto `source_type`: one type can
// be several things the customer would name differently, and 'duckdb/mysql'
// and 'duckdb/pdf' want completely different forms.
//
// This map is deliberately NOT part of the registry in src/lib/pipelineSources.
// Bun imports a .vue file as a plain string rather than a compiled component,
// and does not throw doing it, while vue-tsc still type-checks it as the real
// SFC — so a component reachable from src/lib would make every `bun test`
// assertion that touched it silently meaningless. The registry stays pure and
// testable; the components live here, next to the card that renders them.
import type { Component } from 'vue'
import DuckDbDatabaseForm from './forms/DuckDbDatabaseForm.vue'
import DuckDbReaderForm from './forms/DuckDbReaderForm.vue'
import GoogleSheetsForm from './forms/GoogleSheetsForm.vue'
import RestApiForm from './forms/RestApiForm.vue'

/** A variant absent from this map has no guided form; the JSON editor is it. */
export const SOURCE_FORMS: Record<string, Component> = {
    rest_api: RestApiForm,
    google_sheets: GoogleSheetsForm,
    // The database shape: an ATTACH template behind host/port/user/database.
    'duckdb/mysql': DuckDbDatabaseForm,
    'duckdb/mssql': DuckDbDatabaseForm,
    // The reader shape: an address, a "Read as" picker, a table name.
    'duckdb/pdf': DuckDbReaderForm,
    'duckdb/webbed': DuckDbReaderForm,
    'duckdb/httpfs': DuckDbReaderForm,
    'duckdb/gdrive': DuckDbReaderForm,
}
