import type { Handler } from "@netlify/functions";
import { jsonResponse, requireUser } from "./_shared/auth";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Método no permitido." });
  }

  const auth = await requireUser(event);
  if (!auth.ok) {
    return jsonResponse(auth.status, { error: auth.message });
  }

  return jsonResponse(200, { usuario: auth.usuario });
};
