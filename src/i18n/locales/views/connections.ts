// Copy for workspace-level Connections (the "connect Google once" entity on
// the Integrations page, plus the pipeline wizard's connection picker).
// Deliberately its own `connections` namespace: `catalog.connection.*` already
// means the Lakekeeper/DuckFlight endpoint details on the Catalog page.
export default {
  en: {
    connections: {
      google: {
        title: 'Google account',
        subtitle:
          'Connect Google once and use it everywhere: Sheets pipelines reference this connection instead of storing their own credentials.',
        connect: 'Connect Google',
        disconnect: 'Disconnect',
        empty: 'No Google account connected yet.',
        since: 'connected {date}',
        needsApp:
          'Connecting needs this workspace’s own Google app first — set it up in the “Google” card below, then try again.',
        trustNote:
          'Pipelines in this workspace can read the sheets this account can read. Access uses the read-only Sheets scope.',
      },
      removeConfirm: {
        title: 'Disconnect “{name}”?',
        body: 'Pipelines referencing this connection are refused — detach them first; the Console will tell you if any still use it.',
        confirm: 'Disconnect',
      },
      picker: {
        label: 'Google connection',
        connectNew: 'Connect another…',
        keepExisting: 'Keep current credentials',
        detach: 'Detach — remove this pipeline’s credentials',
        detachHint:
          'Saving will leave this pipeline without credentials, so its runs fail until you connect an account again. Do this to free a connection you want to disconnect.',
        hint: 'The pipeline follows this connection: reconnecting or disconnecting it in Integrations applies here too.',
      },
      toast: {
        connected: 'Google connected as {email}.',
        connectFailed: 'Could not connect Google',
        removed: 'Google connection removed.',
        removeFailed: 'Could not remove the connection',
        inUse: 'This connection is still used by one or more pipelines. Detach or delete those pipelines first.',
        loadFailed: 'Could not load connections',
        flowUnavailable: 'Google sign-in is not available on this server.',
      },
    },
  },
  cs: {
    connections: {
      google: {
        title: 'Účet Google',
        subtitle:
          'Připojte Google jednou a používejte ho všude: pipeline Sheets na toto připojení odkazují a nemusí ukládat vlastní přihlašovací údaje.',
        connect: 'Připojit Google',
        disconnect: 'Odpojit',
        empty: 'Zatím není připojen žádný účet Google.',
        since: 'připojeno {date}',
        needsApp:
          'Připojení nejdřív vyžaduje vlastní aplikaci Google tohoto workspace — nastavte ji v kartě „Google“ níže a zkuste to znovu.',
        trustNote:
          'Pipeline v tomto workspace mohou číst tabulky, které tento účet vidí. Přístup používá read-only scope pro Sheets.',
      },
      removeConfirm: {
        title: 'Odpojit „{name}“?',
        body: 'Pipeline odkazující na toto připojení odpojení zablokují — nejdřív je odpojte; konzole vám řekne, jestli ho nějaká stále používá.',
        confirm: 'Odpojit',
      },
      picker: {
        label: 'Připojení Google',
        connectNew: 'Připojit další…',
        keepExisting: 'Ponechat stávající přihlášení',
        detach: 'Odpojit — odebrat přihlášení této pipeline',
        detachHint:
          'Po uložení zůstane pipeline bez přihlašovacích údajů a její běhy budou selhávat, dokud účet znovu nepřipojíte. Použijte, když chcete uvolnit připojení, které potřebujete odpojit.',
        hint: 'Pipeline toto připojení následuje: opětovné připojení nebo odpojení v Integracích se projeví i zde.',
      },
      toast: {
        connected: 'Google připojen jako {email}.',
        connectFailed: 'Google se nepodařilo připojit',
        removed: 'Připojení Google odebráno.',
        removeFailed: 'Připojení se nepodařilo odebrat',
        inUse: 'Toto připojení stále používá jedna nebo více pipeline. Nejdřív je odpojte nebo smažte.',
        loadFailed: 'Připojení se nepodařilo načíst',
        flowUnavailable: 'Přihlášení přes Google není na tomto serveru dostupné.',
      },
    },
  },
}
