// Copy for the Integrations page: third-party OAuth applications a workspace
// connects sources with. Namespaced under `integrations`, mirroring gitmirror.ts.
export default {
  en: {
    integrations: {
      page: {
        title: 'Integrations',
        intro:
          'Connect the third-party applications your data sources sign in with. These stay yours — FairTier never uses its own app on your behalf.',
        unavailable: 'No integrations are available for this workspace.',
      },
      google: {
        title: 'Google',
        subtitle:
          'Needed before a Google source — a spreadsheet, or files in Drive — can use “Sign in with Google”. You register the app in your own Google Cloud project, so the consent screen, the usage quota and the review status are yours.',
        connect: 'Connect a Google app',
        connected: 'Connected app',
        updatedAt: 'Last changed: {time}',
        edit: 'Replace…',
        remove: 'Disconnect',
        save: 'Save',
        cancel: 'Cancel',
        clientId: 'Client ID',
        clientIdPlaceholder: '….apps.googleusercontent.com',
        clientSecret: 'Client secret',
        clientSecretHint: 'Stored encrypted. It is never shown again, so replacing the app means entering both fields.',
        flowUnavailable:
          'This workspace can store the app, but new Google sign-ins have to be started from the FairTier Console. Existing Sheets pipelines keep refreshing here.',
        setup: {
          title: 'In your Google Cloud project',
          step1: 'Enable the Google Sheets API — and the Google Drive API too, if a source will read files from Drive.',
          step2: 'Create an OAuth client of type “Web application”.',
          step3: 'Add this exact authorised redirect URI:',
          step4: 'Allow these scopes on the consent screen. Google turns a sign-in away if it asks for one the app does not list:',
          verificationNote:
            'An Internal app (Google Workspace only) needs no review. An External app in “Testing” issues sign-ins that expire after 7 days — publish it to keep pipelines running unattended.',
        },
        removeConfirm: {
          title: 'Disconnect this Google app?',
          body: 'Pipelines connected with it — Sheets and Drive alike — will stop refreshing and have to be reconnected. Nothing already loaded into your warehouse is affected.',
          confirm: 'Disconnect',
        },
        toast: {
          saved: 'Google app connected.',
          saveFailed: 'Could not save the Google app',
          removed: 'Google app disconnected.',
          removeFailed: 'Could not disconnect the Google app',
          loadFailed: 'Could not load the Google app',
        },
      },
    },
  },
  cs: {
    integrations: {
      page: {
        title: 'Integrace',
        intro:
          'Připojte aplikace třetích stran, přes které se vaše zdroje přihlašují. Zůstávají vaše — FairTier za vás nikdy nepoužívá vlastní aplikaci.',
        unavailable: 'Pro tento workspace nejsou dostupné žádné integrace.',
      },
      google: {
        title: 'Google',
        subtitle:
          'Nutné, než zdroj Google — tabulka nebo soubory na Disku — použije „Přihlásit se přes Google“. Aplikaci registrujete ve vlastním projektu Google Cloud, takže souhlasná obrazovka, kvóta i stav ověření jsou vaše.',
        connect: 'Připojit aplikaci Google',
        connected: 'Připojená aplikace',
        updatedAt: 'Naposledy změněno: {time}',
        edit: 'Nahradit…',
        remove: 'Odpojit',
        save: 'Uložit',
        cancel: 'Zrušit',
        clientId: 'Client ID',
        clientIdPlaceholder: '….apps.googleusercontent.com',
        clientSecret: 'Client secret',
        clientSecretHint: 'Uloženo šifrovaně. Už se nikdy nezobrazí, takže při výměně aplikace vyplňte obě pole.',
        flowUnavailable:
          'Tento workspace může aplikaci uložit, ale nové přihlášení přes Google je potřeba spustit z konzole FairTier. Stávající pipeline Sheets zde fungují dál.',
        setup: {
          title: 'Ve vašem projektu Google Cloud',
          step1: 'Zapněte Google Sheets API — a také Google Drive API, pokud bude zdroj číst soubory z Disku.',
          step2: 'Vytvořte OAuth klienta typu „Web application“.',
          step3: 'Přidejte přesně tuto autorizovanou redirect URI:',
          step4: 'Povolte na souhlasné obrazovce tyto scopes. Když si přihlášení řekne o scope, který aplikace neuvádí, Google ho odmítne:',
          verificationNote:
            'Interní aplikace (jen pro Google Workspace) nepotřebuje schválení. Externí aplikace ve stavu „Testing“ vydává přihlášení platná 7 dní — pro bezobslužný běh ji publikujte.',
        },
        removeConfirm: {
          title: 'Odpojit tuto aplikaci Google?',
          body: 'Pipeline připojené přes ni — Sheets i Disk — se přestanou obnovovat a bude je potřeba připojit znovu. Data už načtená do skladu to neovlivní.',
          confirm: 'Odpojit',
        },
        toast: {
          saved: 'Aplikace Google připojena.',
          saveFailed: 'Aplikaci Google se nepodařilo uložit',
          removed: 'Aplikace Google odpojena.',
          removeFailed: 'Aplikaci Google se nepodařilo odpojit',
          loadFailed: 'Aplikaci Google se nepodařilo načíst',
        },
      },
    },
  },
}
