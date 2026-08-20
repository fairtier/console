// Copy for the one-click "NYC Taxi Pulse" starter demo card
// (DemoService / docs/plans/starter-demo-project.md §9). Namespaced under
// `demoUi`. The card appears on the empty Pipelines / Transformations /
// Dashboards states (Load) and as a slim bar once the demo is loaded (Remove).
export default {
  en: {
    demoUi: {
      title: 'Try the NYC Taxi Pulse demo',
      body: 'Load 40M+ real NYC taxi trips end-to-end — ingestion, dbt models, a live Rill dashboard, and Flight SQL — in one click. It becomes your project; edit or remove it anytime.',
      load: 'Load demo project',
      loading: 'Loading demo…',
      loaded: 'NYC Taxi Pulse demo loaded.',
      remove: 'Remove demo project',
      removing: 'Removing…',
      toast: {
        loaded: 'Demo project loading — watch the pipeline run.',
        loadFailed: 'Could not load the demo project.',
        removed: 'Demo project removed.',
        removeFailed: 'Could not remove the demo project.',
      },
    },
  },
  cs: {
    demoUi: {
      title: 'Vyzkoušejte demo NYC Taxi Pulse',
      body: 'Načtěte 40M+ reálných newyorských jízd taxíkem od začátku do konce — ingesce, dbt modely, živý Rill dashboard a Flight SQL — jedním kliknutím. Stane se vaším projektem; kdykoli jej upravte nebo odeberte.',
      load: 'Načíst demo projekt',
      loading: 'Načítání dema…',
      loaded: 'Demo NYC Taxi Pulse načteno.',
      remove: 'Odebrat demo projekt',
      removing: 'Odebírání…',
      toast: {
        loaded: 'Demo projekt se načítá — sledujte běh pipeline.',
        loadFailed: 'Demo projekt se nepodařilo načíst.',
        removed: 'Demo projekt odebrán.',
        removeFailed: 'Demo projekt se nepodařilo odebrat.',
      },
    },
  },
}
