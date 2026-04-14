import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { originLat, originLng, destinations } = body;

  if (!originLat || !originLng || !destinations?.length) {
    return new Response(JSON.stringify({ error: "Missing origin or destinations" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = import.meta.env.GOOGLE_MAPS_API_KEY;
  const origin = `${originLat},${originLng}`;

  const allResults: any[] = [];

  for (let i = 0; i < destinations.length; i += 25) {
    const batch = destinations.slice(i, i + 25);
    const destStr = batch.map((d: any) => `${d.lat},${d.lng}`).join("|");

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destStr}&units=imperial&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
      return new Response(JSON.stringify({ error: "Distance Matrix API error", status: data.status }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const elements = data.rows[0].elements;
    for (let j = 0; j < batch.length; j++) {
      if (elements[j].status === "OK") {
        allResults.push({
          index: i + j,
          durationSec: elements[j].duration.value,
          durationText: elements[j].duration.text,
          distanceMi: Math.round(elements[j].distance.value / 1609.34),
        });
      }
    }
  }

  return new Response(JSON.stringify({ results: allResults }), {
    headers: { "Content-Type": "application/json" },
  });
};
