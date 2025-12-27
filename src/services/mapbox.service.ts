import axios from "axios";

const MAPBOX_BASE_URL = "https://api.mapbox.com/directions/v5/mapbox";

export async function getDirectionsService(
    profile: "driving" | "walking" | "cycling",
    coordinates: string
) {
    const url = `${MAPBOX_BASE_URL}/${profile}/${coordinates}`;

    const response = await axios.get(url, {
        params: {
            geometries: "geojson",
            alternatives: true,
            overview: "full",
            access_token: process.env.MAPBOX_ACCESS_TOKEN,
        },
        timeout: 15000,
    });

    return response.data;
}
