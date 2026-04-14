import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");

  if (!address) {
    return new Response(JSON.stringify({ error: "Missing address parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = import.meta.env.GOOGLE_MAPS_API_KEY;
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;

  const res = await fetch(geocodeUrl);
  const data = await res.json();

  if (data.status !== "OK" || !data.results?.length) {
    return new Response(JSON.stringify({ error: "Could not geocode address", status: data.status, detail: data.error_message, raw: data }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const location = data.results[0].geometry.location;
  return new Response(JSON.stringify({ lat: location.lat, lng: location.lng }), {
    headers: { "Content-Type": "application/json" },
  });
};
