import { json, LoaderFunctionArgs } from "@remix-run/node";

/**
 * API Documentation - This route serves as an overview of available API endpoints
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const apiEndpoints = [
    {
      path: "/api/invite-client",
      method: "POST",
      description: "Invites a client to join the platform via email",
      params: [
        {
          name: "email",
          required: true,
          type: "string",
          description: "Client&apos;s email address",
        },
        {
          name: "name",
          required: true,
          type: "string",
          description: "Client&apos;s name",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Success",
          data: {
            success: true,
            email: "client@example.com",
            message: "Invitation sent successfully",
          },
        },
        {
          status: 400,
          description: "Bad Request",
          data: { error: "Email and name are required", success: false },
        },
        {
          status: 500,
          description: "Server Error",
          data: { error: "Failed to send invitation email", success: false },
        },
      ],
    },
    // Add new API endpoints here as they are created
  ];

  // If request accepts HTML, send documentation page
  const acceptHeader = request.headers.get("Accept") || "";

  if (acceptHeader.includes("text/html")) {
    return json({ message: "API Documentation", endpoints: apiEndpoints });
  }

  // Otherwise return JSON response
  return json({
    message: "Vested Fitness API",
    version: "1.0.0",
    endpoints: apiEndpoints.map((endpoint) => endpoint.path),
  });
}

export default function ApiIndex() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-3xl font-bold mb-8">
        Vested Fitness API Documentation
      </h1>

      <div className="space-y-12">
        <section>
          <h2 className="text-xl font-semibold mb-4">Overview</h2>
          <p className="text-gray-dark">
            This documentation provides information about the available API
            endpoints for Vested Fitness. The API is organized around REST
            principles and returns JSON-encoded responses.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Authentication</h2>
          <p className="text-gray-dark mb-4">
            Most API endpoints require authentication. This is handled through
            Supabase Auth.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Endpoints</h2>

          <div className="space-y-8">
            <div className="border border-gray-light rounded-lg overflow-hidden">
              <div className="bg-gray-lightest p-4 border-b border-gray-light">
                <h3 className="text-lg font-medium">
                  <span className="bg-green-500 text-white px-2 py-1 rounded text-xs mr-2">
                    POST
                  </span>
                  /api/invite-client
                </h3>
              </div>
              <div className="p-4">
                <p className="text-gray-dark mb-4">
                  Invites a client to join the platform by sending an email with
                  a registration link.
                </p>

                <h4 className="font-medium mb-2">Parameters</h4>
                <table className="min-w-full mb-4">
                  <thead className="bg-gray-lightest">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium">
                        Type
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium">
                        Required
                      </th>
                      <th className="px-4 py-2 text-left text-sm font-medium">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-light">
                    <tr>
                      <td className="px-4 py-2 text-sm">email</td>
                      <td className="px-4 py-2 text-sm">string</td>
                      <td className="px-4 py-2 text-sm">Yes</td>
                      <td className="px-4 py-2 text-sm">
                        Client&apos;s email address
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm">name</td>
                      <td className="px-4 py-2 text-sm">string</td>
                      <td className="px-4 py-2 text-sm">Yes</td>
                      <td className="px-4 py-2 text-sm">Client&apos;s name</td>
                    </tr>
                  </tbody>
                </table>

                <h4 className="font-medium mb-2">Responses</h4>
                <div className="space-y-4">
                  <div>
                    <div className="bg-green-500/10 p-2 rounded-t-lg">
                      <p className="text-sm font-medium">200 - Success</p>
                    </div>
                    <pre className="bg-gray-lightest p-3 rounded-b-lg overflow-x-auto text-xs">
                      {`{
  "success": true,
  "email": "client@example.com",
  "message": "Invitation sent successfully"
}`}
                    </pre>
                  </div>

                  <div>
                    <div className="bg-amber-500/10 p-2 rounded-t-lg">
                      <p className="text-sm font-medium">400 - Bad Request</p>
                    </div>
                    <pre className="bg-gray-lightest p-3 rounded-b-lg overflow-x-auto text-xs">
                      {`{
  "error": "Email and name are required",
  "success": false
}`}
                    </pre>
                  </div>

                  <div>
                    <div className="bg-red-500/10 p-2 rounded-t-lg">
                      <p className="text-sm font-medium">500 - Server Error</p>
                    </div>
                    <pre className="bg-gray-lightest p-3 rounded-b-lg overflow-x-auto text-xs">
                      {`{
  "error": "Failed to send invitation email",
  "success": false
}`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
