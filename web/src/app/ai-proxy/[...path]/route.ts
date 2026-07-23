import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UPSTREAM_ORIGIN = "https://weilai.chat";
const REQUEST_HEADERS = ["accept", "authorization", "content-type", "if-modified-since", "if-none-match", "openai-organization", "openai-project", "range", "x-api-key", "x-goog-api-key"];
const RESPONSE_HEADERS = ["accept-ranges", "cache-control", "content-disposition", "content-range", "content-type", "etag", "last-modified", "retry-after", "x-request-id"];

type ProxyContext = { params: Promise<{ path: string[] }> };

async function proxyRequest(request: NextRequest, context: ProxyContext) {
    const { path } = await context.params;
    const target = new URL(`/${path.map(encodeURIComponent).join("/")}`, UPSTREAM_ORIGIN);
    request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

    const headers = new Headers();
    REQUEST_HEADERS.forEach((name) => {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    });

    const method = request.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    const init: RequestInit & { duplex?: "half" } = {
        method,
        headers,
        body: hasBody ? request.body : undefined,
        signal: request.signal,
        redirect: "follow",
    };
    if (hasBody) init.duplex = "half";

    try {
        const response = await fetch(target, init);
        const responseHeaders = new Headers();
        RESPONSE_HEADERS.forEach((name) => {
            const value = response.headers.get(name);
            if (value) responseHeaders.set(name, value);
        });
        return new Response(method === "HEAD" ? null : response.body, { status: response.status, headers: responseHeaders });
    } catch (error) {
        if (request.signal.aborted) return new Response("Request cancelled", { status: 499 });
        return new Response(error instanceof Error ? error.message : "AI proxy error", { status: 502 });
    }
}

export { proxyRequest as DELETE, proxyRequest as GET, proxyRequest as HEAD, proxyRequest as OPTIONS, proxyRequest as PATCH, proxyRequest as POST, proxyRequest as PUT };
