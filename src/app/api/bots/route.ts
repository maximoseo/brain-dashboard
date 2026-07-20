import { supabase } from "../../../lib/supabase";
export async function GET() {
  const { data, error } = await supabase.from("bots").select("*").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ bots: data });
}
