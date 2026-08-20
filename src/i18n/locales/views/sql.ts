// Copy for the SQL editor view (editor, results grid, catalog tree).
// Namespaced under `sqlUi`; `nav.sql` lives in the shared locale files.
export default {
  en: {
    sqlUi: {
      heading: 'SQL',
      subtitle: 'Query your Iceberg tables with DuckDB.',
      run: 'Run',
      running: 'Running…',
      runHint: 'Ctrl/Cmd + Enter',
      rowLimit: 'Row limit',
      editorPlaceholder: 'SELECT * FROM …',
      status: {
        rows: '{count} rows',
        duration: '{ms} ms',
        truncated: 'Truncated at {count} rows',
      },
      results: {
        empty: 'Run a query to see results.',
        emptyResult: 'Query returned no rows.',
        null: 'NULL',
        copied: 'Cell value copied',
      },
      catalog: {
        title: 'Tables',
        refresh: 'Refresh tables',
        empty: 'No tables yet. Load data with a pipeline first.',
        preview: 'Preview',
        loadFailed: 'Could not load the table list',
      },
      errors: {
        title: 'Query failed',
      },
      disabled: {
        title: 'Query engine is off',
        body: 'The SQL editor runs on the DuckFlight query engine. Enable it under Apps & BI to start querying.',
        cta: 'Go to Apps & BI',
      },
    },
  },
  cs: {
    sqlUi: {
      heading: 'SQL',
      subtitle: 'Dotazujte se na své Iceberg tabulky pomocí DuckDB.',
      run: 'Spustit',
      running: 'Běží…',
      runHint: 'Ctrl/Cmd + Enter',
      rowLimit: 'Limit řádků',
      editorPlaceholder: 'SELECT * FROM …',
      status: {
        rows: '{count} řádků',
        duration: '{ms} ms',
        truncated: 'Zkráceno na {count} řádků',
      },
      results: {
        empty: 'Spusťte dotaz a uvidíte výsledky.',
        emptyResult: 'Dotaz nevrátil žádné řádky.',
        null: 'NULL',
        copied: 'Hodnota buňky zkopírována',
      },
      catalog: {
        title: 'Tabulky',
        refresh: 'Obnovit tabulky',
        empty: 'Zatím žádné tabulky. Nejprve nahrajte data pomocí pipeline.',
        preview: 'Náhled',
        loadFailed: 'Nepodařilo se načíst seznam tabulek',
      },
      errors: {
        title: 'Dotaz selhal',
      },
      disabled: {
        title: 'Dotazovací engine je vypnutý',
        body: 'SQL editor běží na dotazovacím enginu DuckFlight. Zapněte ho v sekci Aplikace a BI.',
        cta: 'Přejít na Aplikace a BI',
      },
    },
  },
}
