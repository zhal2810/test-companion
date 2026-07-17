export const onRequestGet: PagesFunction = async () => {
  return Response.json({ status: "ok", message: "WarEra Planner Backend Proxy is online!" });
};
