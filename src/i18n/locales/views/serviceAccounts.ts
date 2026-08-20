export default {
  en: {
    serviceAccounts: {
      title: 'Service accounts',
      intro: 'Machine identities that let tools and pipelines reach your catalog.',
      newAccount: 'New account',
      form: {
        title: 'New service account',
        name: 'Name',
        namePlaceholder: 'etl-bot',
        role: 'Role',
        warehouse: 'Warehouse',
        create: 'Create account',
        cancel: 'Cancel',
        creating: 'Creating…',
      },
      roles: {
        reader: 'reader',
        writer: 'writer',
        admin: 'admin',
      },
      result: {
        title: 'Account created — copy the secret now',
        warning:
          "This secret is shown once. We can't recover it — if you lose it you'll have to rotate the account.",
        activation:
          'On dedicated workspaces the credentials become active within a few minutes (the workspace picks up the new account on its next sync).',
        clientId: 'Client ID',
        clientSecret: 'Client secret',
        dismiss: "I've saved the secret",
      },
      table: {
        name: 'Name',
        role: 'Role',
        warehouse: 'Warehouse',
        delete: 'Delete account',
        unknownWarehouse: '—',
      },
      empty: 'No service accounts yet. Create one to let your tools reach the catalog.',
      loading: 'Loading service accounts…',
      validation: {
        required: 'Name is required.',
        invalidName:
          'Name may only contain alphanumeric characters, hyphens, or underscores. No consecutive hyphens or underscores, and it cannot start or end with one.',
        duplicate: 'A service account with this name already exists.',
      },
      confirmDelete: {
        title: 'Delete service account',
        body: 'This permanently revokes "{name}" and its credentials. Tools using it will stop working immediately.',
        confirm: 'Delete account',
      },
      toast: {
        created: 'Service account created.',
        deleted: 'Service account deleted.',
        createError: 'Could not create the service account.',
        deleteError: 'Could not delete the service account.',
        loadError: 'Could not load service accounts.',
      },
    },
  },
  cs: {
    serviceAccounts: {
      title: 'Servisní účty',
      intro: 'Strojové identity, díky kterým nástroje a pipeline dosáhnou na váš katalog.',
      newAccount: 'Nový účet',
      form: {
        title: 'Nový servisní účet',
        name: 'Název',
        namePlaceholder: 'etl-bot',
        role: 'Role',
        warehouse: 'Sklad',
        create: 'Vytvořit účet',
        cancel: 'Zrušit',
        creating: 'Vytvářím…',
      },
      roles: {
        reader: 'reader',
        writer: 'writer',
        admin: 'admin',
      },
      result: {
        title: 'Účet vytvořen — zkopírujte tajný klíč hned teď',
        warning:
          'Tento tajný klíč zobrazujeme pouze jednou. Nelze jej obnovit — pokud jej ztratíte, budete muset účet rotovat.',
        activation:
          'Na dedikovaných workspace se přihlašovací údaje aktivují během několika minut (workspace nový účet převezme při příští synchronizaci).',
        clientId: 'Client ID',
        clientSecret: 'Client secret',
        dismiss: 'Tajný klíč jsem uložil/a',
      },
      table: {
        name: 'Název',
        role: 'Role',
        warehouse: 'Sklad',
        delete: 'Smazat účet',
        unknownWarehouse: '—',
      },
      empty: 'Zatím žádné servisní účty. Vytvořte jeden, aby vaše nástroje dosáhly na katalog.',
      loading: 'Načítám servisní účty…',
      validation: {
        required: 'Název je povinný.',
        invalidName:
          'Název smí obsahovat pouze alfanumerické znaky, pomlčky nebo podtržítka. Bez dvou po sobě jdoucích pomlček či podtržítek a nesmí jimi začínat ani končit.',
        duplicate: 'Servisní účet s tímto názvem už existuje.',
      },
      confirmDelete: {
        title: 'Smazat servisní účet',
        body: 'Tímto trvale zrušíte „{name}“ a jeho přihlašovací údaje. Nástroje, které jej používají, okamžitě přestanou fungovat.',
        confirm: 'Smazat účet',
      },
      toast: {
        created: 'Servisní účet vytvořen.',
        deleted: 'Servisní účet smazán.',
        createError: 'Servisní účet se nepodařilo vytvořit.',
        deleteError: 'Servisní účet se nepodařilo smazat.',
        loadError: 'Servisní účty se nepodařilo načíst.',
      },
    },
  },
}
