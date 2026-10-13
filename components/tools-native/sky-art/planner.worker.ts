import { buildGeometry } from "@/lib/sky-art/fonts";
import {
  planPlacedRoute,
  type RoutingPlacement,
} from "@/lib/sky-art/placement-planner";
import type { Composition, Variant } from "@/lib/sky-art/types";
let geometryKey = "";
let geometryJob: ReturnType<typeof buildGeometry> | undefined;
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    composition: Composition;
    variant: Variant;
    placement: RoutingPlacement;
    key: string;
  }>,
) => {
  const { id, composition, variant, key, placement } = event.data;
  try {
    const compositionKey = JSON.stringify(composition);
    if (compositionKey !== geometryKey || !geometryJob) {
      geometryKey = compositionKey;
      geometryJob = buildGeometry(composition);
    }
    const geometry = await geometryJob;
    self.postMessage({
      id,
      key,
      geometry,
      route: planPlacedRoute(geometry, composition, variant, placement),
    });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "Could not generate the route.",
    });
  }
};
