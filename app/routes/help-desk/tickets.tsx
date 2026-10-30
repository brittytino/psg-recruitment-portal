import { Link } from "react-router";
import type { Route } from "./+types/tickets";
import { CandidateHelpDeskShell } from "~/components/helpdesk";
import { CandidateTicketTable } from "~/components/helpdesk-tickets";
import { PageHeader } from "~/components/staff";
import { requireUser } from "~/lib/http.server";
import { myTickets, ticketListSchema } from "~/modules/helpdesk/service.server";

export const meta: Route.MetaFunction = () => [{ title: "My tickets — Help desk" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireUser(context, request);
  const q = ticketListSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return { q, ...(await myTickets(user, q)) };
}

export default function MyTickets({ loaderData: L }: Route.ComponentProps) {
  return (
    <CandidateHelpDeskShell signedIn>
      <div className="page-stack">
        <PageHeader
          crumbs={[["Help desk", "/help-desk"], ["My tickets"]]}
          title="My tickets"
          description="Every support request you have raised, with its current status."
          actions={
            <Link to="/help-desk/new" className="btn-primary">
              Create ticket
            </Link>
          }
        />
        <CandidateTicketTable
          rows={L.rows}
          total={L.total}
          page={L.q.page}
          pages={L.pages}
          q={L.q}
          action="/help-desk/tickets"
        />
      </div>
    </CandidateHelpDeskShell>
  );
}
