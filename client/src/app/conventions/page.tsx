import { ConventionsView } from "./_components/ConventionsView/ConventionsView";

/* Route: /conventions (global — repo comes from useActiveRepo(), not the URL).
   Thin route entry — the view, cards, modal and i18n are colocated under
   _components. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
