import axios from "axios";
import polyline from "@mapbox/polyline";
import { config } from "../bot/config/env";

type LatLng = {
    lat: number;
    lng: number;
};

type RouteData = {
    distanceMeters: number;
    duration: string;
    staticDuration?: string; // optional now
    polyline: string; // merged polyline
    points: LatLng[];
};

type GoogleRoutesResponse = {
    routes: Array<{
        distanceMeters: number;
        duration: string;
        staticDuration?: string;
        legs?: Array<{
            steps?: Array<{
                polyline?: {
                    encodedPolyline: string;
                };
            }>;
        }>;
    }>;
};

export const DirectionsService = {
    async getRoute(start: LatLng, end: LatLng): Promise<RouteData | null> {
        const url = "https://routes.googleapis.com/directions/v2:computeRoutes";

        try {
            const response = await axios.post<GoogleRoutesResponse>(
                url,
                {
                    origin: {
                        location: {
                            latLng: {
                                latitude: start.lat,
                                longitude: start.lng,
                            },
                        },
                    },
                    destination: {
                        location: {
                            latLng: {
                                latitude: end.lat,
                                longitude: end.lng,
                            },
                        },
                    },
                    travelMode: "DRIVE",
                    routingPreference: "TRAFFIC_AWARE",
                    polylineEncoding: "ENCODED_POLYLINE",
                    polylineQuality: "HIGH_QUALITY", // 🔥 important
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": config.GOOGLE_MAPS_API_KEY,
                        "X-Goog-FieldMask":
                            "routes.distanceMeters,routes.duration,routes.staticDuration,routes.legs.steps.polyline.encodedPolyline",
                    },
                }
            );

            const route = response.data.routes?.[0];
            if (!route) {
                console.warn("⚠️ No routes returned from Google API");
                return null;
            }

            const steps = route.legs?.[0]?.steps ?? [];

            const points: LatLng[] = [];
            const encodedSegments: string[] = [];

            for (const step of steps) {
                const encoded = step.polyline?.encodedPolyline;
                if (!encoded) continue;

                encodedSegments.push(encoded);

                const decoded = polyline.decode(encoded);
                const stepPoints = decoded.map(([lat, lng]) => ({ lat, lng }));

                points.push(...stepPoints);
            }

            // Optional: merge encoded polylines into one string (not required but useful)
            const mergedPolyline = encodedSegments.join("");

            return {
                distanceMeters: route.distanceMeters,
                duration: route.duration,
                staticDuration: route.staticDuration,
                polyline: mergedPolyline,
                points,
            };
        } catch (error: any) {
            if (error.response) {
                console.error("❌ Google Routes API error response:", {
                    status: error.response.status,
                    data: error.response.data,
                });
            } else if (error.request) {
                console.error("❌ No response received from Google Routes API:", error.request);
            } else {
                console.error("❌ Error setting up request:", error.message);
            }

            return null;
        }
    },
};