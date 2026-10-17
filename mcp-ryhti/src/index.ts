
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "ryhti-mcp",
  version: "1.0.0",
});

const SERVICES = {
  building:
    "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1",
  permit:
    "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_permit/ogc/features/v1",
  inspireBuilding:
    "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_inspire_bu/ogc/features/v1",
  inspireAddress:
    "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_inspire_ad/ogc/features/v1",
} as const;

type ServiceName = keyof typeof SERVICES;

const COLLECTIONS: Record<string, ServiceName> = {
  open_building: "building",
  open_address: "building",
  open_permit_building: "permit",
  open_permit_address: "permit",
  "BU.Building": "inspireBuilding",
  "AD.Address": "inspireAddress",
};

const MAX_LIMIT = 3000;

function getBase(collection: string): string {
  const service = COLLECTIONS[collection];

  if (!service) {
    throw new Error(
      `Unsupported collection: ${collection}. ` +
      "Call ryhti_list_collections to inspect available collections."
    );
  }

  return SERVICES[service];
}

async function getJson(
  url: URL,
  timeoutMs = 20000
): Promise<any> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/geo+json, application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(
      `Ryhti API returned HTTP ${response.status}: ` +
      (await response.text()).slice(0, 1000)
    );
  }

  return response.json();
}

function result(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// 1. Khám phá các collection của Ryhti.
server.tool(
  "ryhti_list_collections",
  "List available Ryhti data collections for buildings, addresses and permits.",
  {
    service: z.enum([
      "building",
      "permit",
      "inspireBuilding",
      "inspireAddress",
    ]).default("building"),
  },
  async ({ service }) => {
    const url = new URL(`${SERVICES[service]}/collections`);
    url.searchParams.set("f", "json");

    return result(await getJson(url));
  }
);

// 2. Lấy schema các trường có thể truy vấn.
// Nên gọi tool này trước khi viết filter theo tên trường.
server.tool(
  "ryhti_get_queryables",
  "Get queryable field names and types for a Ryhti collection.",
  {
    collection: z.string(),
  },
  async ({ collection }) => {
    const url = new URL(
      `${getBase(collection)}/collections/` +
      `${encodeURIComponent(collection)}/queryables`
    );
    url.searchParams.set("f", "json");

    return result(await getJson(url));
  }
);

// 3. Tìm feature theo giới hạn, offset, bbox và filter.
// bbox sử dụng CRS do API quy định; mặc định là EPSG:4326
// theo cách triển khai phổ biến của OGC API Features.
// Với bbox EPSG:3067, phải truyền bbox-crs tương ứng.
server.tool(
  "ryhti_get_features",
  "Query Ryhti buildings, addresses or permits with pagination and optional filters.",
  {
    collection: z.string(),
    limit: z.number().int().min(1).max(MAX_LIMIT).default(100),
    offset: z.number().int().min(0).default(0),
    bbox: z.array(z.number()).length(4).optional()
      .describe("Bounding box [minX,minY,maxX,maxY]."),
    bboxCrs: z.string().optional()
      .describe("Optional bbox CRS URI, e.g. EPSG:3067 URI."),
    filter: z.string().optional()
      .describe("Optional server-side filter. Inspect queryables first."),
    filterLang: z.enum(["cql2-text", "cql2-json"]).optional(),
  },
  async ({
    collection,
    limit,
    offset,
    bbox,
    bboxCrs,
    filter,
    filterLang,
  }) => {
    const url = new URL(
      `${getBase(collection)}/collections/` +
      `${encodeURIComponent(collection)}/items`
    );

    url.searchParams.set("f", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    if (bbox) {
      url.searchParams.set("bbox", bbox.join(","));
    }

    if (bboxCrs) {
      url.searchParams.set("bbox-crs", bboxCrs);
    }

    if (filter) {
      url.searchParams.set("filter", filter);
    }

    if (filterLang) {
      url.searchParams.set("filter-lang", filterLang);
    }

    const data = await getJson(url);

    return result({
      collection,
      requestedLimit: limit,
      requestedOffset: offset,
      returnedFeatures: data.features?.length ?? 0,
      numberMatched: data.numberMatched ?? null,
      nextPageAvailable: Boolean(
        data.links?.some((link: { rel?: string }) =>
          link.rel === "next"
        )
      ),
      data,
    });
  }
);

// 4. Lấy một feature theo ID.
server.tool(
  "ryhti_get_feature",
  "Retrieve a single Ryhti feature by collection and feature ID.",
  {
    collection: z.string(),
    featureId: z.string(),
  },
  async ({ collection, featureId }) => {
    const url = new URL(
      `${getBase(collection)}/collections/` +
      `${encodeURIComponent(collection)}/items/` +
      `${encodeURIComponent(featureId)}`
    );
    url.searchParams.set("f", "json");

    return result(await getJson(url));
  }
);

// Dùng stderr cho log để không làm hỏng giao thức stdio.
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Ryhti MCP server started.");
}

main().catch((error) => {
  console.error("Ryhti MCP failed:", error);
  process.exitCode = 1;
});
