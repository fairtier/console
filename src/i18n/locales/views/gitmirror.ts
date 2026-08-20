// Copy for the git push-mirror card (mirror a box repo to the customer's own
// GitHub/GitLab). Namespaced under `gitMirror`, mirroring rill.ts.
export default {
  en: {
    gitMirror: {
      title: 'Mirror to your own Git',
      subtitle:
        'Push a live copy of this repository to your own GitHub or GitLab — an offsite backup you fully control, updated on every save.',
      remoteUrl: 'Remote clone URL',
      remoteUrlPlaceholder: 'https://github.com/your-org/your-repo.git',
      username: 'Username',
      usernameHint: 'GitHub: your account name · GitLab: “oauth2”',
      token: 'Access token',
      tokenHint:
        'Needs write access to the remote repository. Stored on your workspace box only — FairTier never keeps it.',
      enable: 'Start mirroring',
      configured: 'Mirroring to',
      lastSync: 'Last sync: {time}',
      neverSynced: 'Not synced yet',
      syncError: 'Last sync failed: {error}',
      syncNow: 'Sync now',
      remove: 'Remove',
      edit: 'Replace…',
      cancel: 'Cancel',
      toast: {
        saved: 'Mirror configured — the first push starts right away.',
        saveFailed: 'Could not configure the mirror',
        synced: 'Sync triggered.',
        syncFailed: 'Could not trigger the sync',
        removed: 'Mirror removed.',
        removeFailed: 'Could not remove the mirror',
        loadFailed: 'Could not load the mirror status',
      },
      removeConfirm: {
        title: 'Remove the mirror?',
        body: 'Pushing to {url} stops and the stored token is deleted from your box. The remote repository itself is not touched.',
        confirm: 'Remove',
      },
      movedLink: 'Mirror to your own Git →',
      page: {
        title: 'Git',
        intro:
          'Your workspace repositories live in the Git server on your box. Mirror any of them to your own GitHub or GitLab — an offsite copy you fully control, pushed on every save and re-synced every 8 hours.',
        unavailable: 'Git mirroring is available on dedicated workspaces only.',
        repos: {
          rill: {
            title: 'Dashboards — rill',
            desc: 'The Rill project you edit on the Dashboards page: sources, metrics, and dashboards.',
          },
          transformations: {
            title: 'Transformations — transformations',
            desc: 'The dbt project you edit on the Transformations page: models, tests, and configuration.',
          },
          pipelines: {
            title: 'Pipelines — pipelines',
            desc: 'Pipeline definitions rendered by the Console. Source credentials inside are age-encrypted, so mirroring is safe.',
          },
        },
      },
    },
  },
  cs: {
    gitMirror: {
      title: 'Zrcadlit do vlastního Gitu',
      subtitle:
        'Odesílejte živou kopii tohoto repozitáře na vlastní GitHub nebo GitLab — offsite záloha plně pod vaší kontrolou, aktualizovaná při každém uložení.',
      remoteUrl: 'URL vzdáleného repozitáře',
      remoteUrlPlaceholder: 'https://github.com/vase-org/vas-repo.git',
      username: 'Uživatelské jméno',
      usernameHint: 'GitHub: název účtu · GitLab: „oauth2“',
      token: 'Přístupový token',
      tokenHint:
        'Vyžaduje právo zápisu do vzdáleného repozitáře. Ukládá se pouze na vašem workspace boxu — FairTier jej nikdy neuchovává.',
      enable: 'Spustit zrcadlení',
      configured: 'Zrcadlí se do',
      lastSync: 'Poslední synchronizace: {time}',
      neverSynced: 'Zatím nesynchronizováno',
      syncError: 'Poslední synchronizace selhala: {error}',
      syncNow: 'Synchronizovat teď',
      remove: 'Odstranit',
      edit: 'Nahradit…',
      cancel: 'Zrušit',
      toast: {
        saved: 'Zrcadlení nastaveno — první push začíná hned.',
        saveFailed: 'Zrcadlení se nepodařilo nastavit',
        synced: 'Synchronizace spuštěna.',
        syncFailed: 'Synchronizaci se nepodařilo spustit',
        removed: 'Zrcadlení odstraněno.',
        removeFailed: 'Zrcadlení se nepodařilo odstranit',
        loadFailed: 'Stav zrcadlení se nepodařilo načíst',
      },
      removeConfirm: {
        title: 'Odstranit zrcadlení?',
        body: 'Push do {url} se zastaví a uložený token se z vašeho boxu smaže. Samotný vzdálený repozitář zůstane nedotčen.',
        confirm: 'Odstranit',
      },
      movedLink: 'Zrcadlit do vlastního Gitu →',
      page: {
        title: 'Git',
        intro:
          'Repozitáře vašeho workspace žijí na Git serveru vašeho boxu. Kterýkoli z nich můžete zrcadlit na vlastní GitHub nebo GitLab — offsite kopie plně pod vaší kontrolou, odesílaná při každém uložení a znovu synchronizovaná každých 8 hodin.',
        unavailable: 'Zrcadlení Gitu je dostupné pouze na dedikovaných workspace.',
        repos: {
          rill: {
            title: 'Dashboardy — rill',
            desc: 'Projekt Rill upravovaný na stránce Dashboardy: zdroje, metriky a dashboardy.',
          },
          transformations: {
            title: 'Transformace — transformations',
            desc: 'Dbt projekt upravovaný na stránce Transformace: modely, testy a konfigurace.',
          },
          pipelines: {
            title: 'Pipeline — pipelines',
            desc: 'Definice pipeline generované Konzolí. Přihlašovací údaje zdrojů uvnitř jsou šifrované pomocí age, zrcadlení je proto bezpečné.',
          },
        },
      },
    },
  },
}
