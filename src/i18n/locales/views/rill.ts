// Copy for the Rill project file editor (box Gitea repo, AI drafting).
// Namespaced under `rillUi`, mirroring pipelines.ts.
export default {
  en: {
    rillUi: {
      heading: 'Dashboards (Rill)',
      subtitle: 'Edit your Rill dashboards and models — saves commit to your box and hot-reload in Rill within a minute.',
      openRill: 'Open Rill',
      retry: 'Retry',
      unavailable: {
        title: 'The dashboard editor isn’t available yet',
        body: 'Editing Rill files from the Console needs a dedicated workspace box with Rill enabled, and the box has to publish its editor credentials first (this happens automatically shortly after deployment).',
      },
      error: {
        title: 'Could not load the Rill project',
      },
      files: {
        other: 'project',
        empty: 'No files yet — draft a dashboard with AI or create a file below.',
        new: 'New file',
        create: 'Create',
        cancel: 'Cancel',
      },
      editor: {
        save: 'Save',
        reload: 'Reload',
        placeholder: 'Select a file on the left, or draft a dashboard with AI.',
        hint: 'Saving commits to your box repo; Rill hot-reloads the change within ~1 minute.',
      },
      ai: {
        button: 'Draft with AI',
        placeholder: 'e.g. A revenue dashboard from the stripe charges table, daily, split by country',
        draft: 'Draft files',
        drafted: 'Drafted {count} file(s) — review and save each one.',
        notConfigured: 'AI drafting is coming soon — create and edit files manually for now.',
        rateLimited: 'Too many drafting requests — wait a minute and try again.',
        draftFailed: 'Drafting failed',
      },
      history: {
        button: 'History',
        title: 'Version history',
        empty: 'No saved versions of this file yet.',
        load: 'Load',
        loaded: 'Version {sha} loaded into the editor — review it and Save to restore.',
        loadFailed: 'Could not load the version history',
        loadVersionFailed: 'Could not load that version',
      },
      toast: {
        saved: 'Saved — Rill reloads it within a minute',
        saveFailed: 'Could not save the file',
        conflict: 'This file changed outside the Console (e.g. in Rill). Reload it to get the latest version.',
        openFailed: 'Could not open the file',
        loadFailed: 'Could not load the project files',
        badNewPath: 'The path must be inside models/, metrics/ or dashboards/.',
      },
      closeConfirm: {
        title: 'Discard unsaved changes?',
        body: '{path} has unsaved changes that will be lost.',
        confirm: 'Discard',
      },
      reloadConfirm: {
        title: 'Reload from the repo?',
        body: 'Your unsaved changes to this file will be lost.',
        confirm: 'Reload',
      },
    },
  },
  cs: {
    rillUi: {
      heading: 'Dashboardy (Rill)',
      subtitle: 'Upravujte své Rill dashboardy a modely — uložení commitne na váš box a Rill změnu do minuty načte.',
      openRill: 'Otevřít Rill',
      retry: 'Zkusit znovu',
      unavailable: {
        title: 'Editor dashboardů zatím není k dispozici',
        body: 'Úprava Rill souborů z Konzole vyžaduje dedikovaný workspace box se zapnutým Rillem a box musí nejdřív publikovat přihlašovací údaje editoru (proběhne automaticky krátce po nasazení).',
      },
      error: {
        title: 'Rill projekt se nepodařilo načíst',
      },
      files: {
        other: 'projekt',
        empty: 'Zatím žádné soubory — nechte si navrhnout dashboard pomocí AI nebo vytvořte soubor níže.',
        new: 'Nový soubor',
        create: 'Vytvořit',
        cancel: 'Zrušit',
      },
      editor: {
        save: 'Uložit',
        reload: 'Znovu načíst',
        placeholder: 'Vyberte soubor vlevo, nebo si nechte navrhnout dashboard pomocí AI.',
        hint: 'Uložení commitne do repozitáře na vašem boxu; Rill změnu načte do ~1 minuty.',
      },
      ai: {
        button: 'Navrhnout pomocí AI',
        placeholder: 'např. Revenue dashboard z tabulky stripe charges, denně, rozdělený podle země',
        draft: 'Navrhnout soubory',
        drafted: 'Navrženo {count} souborů — zkontrolujte a uložte každý zvlášť.',
        notConfigured: 'AI návrhy brzy — zatím vytvářejte a upravujte soubory ručně.',
        rateLimited: 'Příliš mnoho požadavků — počkejte minutu a zkuste to znovu.',
        draftFailed: 'Návrh se nezdařil',
      },
      history: {
        button: 'Historie',
        title: 'Historie verzí',
        empty: 'Tento soubor zatím nemá žádné uložené verze.',
        load: 'Načíst',
        loaded: 'Verze {sha} načtena do editoru — zkontrolujte ji a Uložením obnovte.',
        loadFailed: 'Historii verzí se nepodařilo načíst',
        loadVersionFailed: 'Tuto verzi se nepodařilo načíst',
      },
      toast: {
        saved: 'Uloženo — Rill změnu do minuty načte',
        saveFailed: 'Soubor se nepodařilo uložit',
        conflict: 'Soubor byl změněn mimo Konzoli (např. v Rillu). Znovu jej načtěte pro aktuální verzi.',
        openFailed: 'Soubor se nepodařilo otevřít',
        loadFailed: 'Soubory projektu se nepodařilo načíst',
        badNewPath: 'Cesta musí být uvnitř models/, metrics/ nebo dashboards/.',
      },
      closeConfirm: {
        title: 'Zahodit neuložené změny?',
        body: '{path} má neuložené změny, které budou ztraceny.',
        confirm: 'Zahodit',
      },
      reloadConfirm: {
        title: 'Znovu načíst z repozitáře?',
        body: 'Neuložené změny v tomto souboru budou ztraceny.',
        confirm: 'Znovu načíst',
      },
    },
  },
}
